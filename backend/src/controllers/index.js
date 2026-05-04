const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { sanitizeTemplateHtml } = require("../utils/sanitizeTemplateHtml");
const User = require("../models/User");
const List = require("../models/List");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Campaign = require("../models/Campaign");
const EmailLog = require("../models/EmailLog");
const EventLog = require("../models/EventLog");
const { enqueueCampaign } = require("../queues/emailQueue");
const { normalizeRange, buildEngagementTimeline } = require("../utils/campaignEngagementTimeline");

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

/** Daily sent/opened/clicked from EmailLog (same semantics as dashboard KPIs). */
const buildEmailLogWeeklyStats = async (ownerId, startUtc, endUtc, daysCount) => {
  const ownerOid = new mongoose.Types.ObjectId(String(ownerId));
  const days = [];
  for (let i = 0; i < daysCount; i += 1) {
    const d = new Date(startUtc);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dayStr = (field) => ({
    $dateToString: { format: "%Y-%m-%d", date: field, timezone: "UTC" },
  });

  const [sentByDay, openedByDay, clickedByDay] = await Promise.all([
    EmailLog.aggregate([
      { $match: { owner: ownerOid } },
      { $addFields: { sendDay: { $ifNull: ["$sentAt", "$createdAt"] } } },
      { $match: { sendDay: { $gte: startUtc, $lte: endUtc } } },
      { $group: { _id: dayStr("$sendDay"), n: { $sum: 1 } } },
    ]),
    EmailLog.aggregate([
      { $match: { owner: ownerOid, opened: true } },
      { $addFields: { openDay: { $ifNull: ["$openedAt", { $ifNull: ["$lastEventAt", "$createdAt"] }] } } },
      { $match: { openDay: { $gte: startUtc, $lte: endUtc } } },
      { $group: { _id: dayStr("$openDay"), n: { $sum: 1 } } },
    ]),
    EmailLog.aggregate([
      { $match: { owner: ownerOid, clicked: true } },
      { $addFields: { clickDay: { $ifNull: ["$clickedAt", { $ifNull: ["$lastEventAt", "$createdAt"] }] } } },
      { $match: { clickDay: { $gte: startUtc, $lte: endUtc } } },
      { $group: { _id: dayStr("$clickDay"), n: { $sum: 1 } } },
    ]),
  ]);

  const toMap = (rows) => Object.fromEntries(rows.map((x) => [x._id, x.n]));
  const sentMap = toMap(sentByDay);
  const openedMap = toMap(openedByDay);
  const clickedMap = toMap(clickedByDay);

  return days.map((date) => ({
    date,
    sent: sentMap[date] || 0,
    opened: openedMap[date] || 0,
    clicked: clickedMap[date] || 0,
  }));
};

const attachContactToList = async (ownerId, contactId, listId) => {
  await List.updateOne({ _id: listId, owner: ownerId }, { $addToSet: { contacts: contactId } });
  await Contact.updateOne({ _id: contactId, owner: ownerId }, { $addToSet: { lists: listId } });
};

/** Parse first sheet of .xlsx / .xls / .csv buffer into { name, email, phone, fields } rows. */
const parseSpreadsheetBufferToRows = (buffer) => {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows
    .map((r) => {
      const o = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase(), v]));
      const fields = { ...o };
      delete fields.name;
      delete fields.email;
      delete fields.phone;
      delete fields.mobile;
      delete fields.tel;
      const email = String(o.email || "").toLowerCase().trim();
      const phone = String(o.phone ?? o.mobile ?? o.tel ?? "").trim();
      return {
        name: String(o.name || "").trim(),
        email,
        phone,
        fields,
      };
    })
    .filter((x) => x.email);
};

const normalizeTemplateAttachments = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      name: String(item?.name || "").trim(),
      url: String(item?.url || "").trim(),
      path: String(item?.path || "").trim(),
      mimeType: String(item?.mimeType || "").trim(),
      size: Number(item?.size || 0),
    }))
    .filter((a) => a.name && a.url && a.path);
};

exports.register = async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    const user = await User.create({ email: req.body.email.toLowerCase(), password: hash });
    res.status(201).json({ token: sign(user._id), user: { id: user._id, email: user.email } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.login = async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ message: "Invalid credentials" });
  res.json({ token: sign(user._id), user: { id: user._id, email: user.email } });
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("email").lean();
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    res.json({ id: user._id, email: user.email });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.uploadExcel = async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: "File is required" });

  const listIdRaw = String(req.body.listId || "").trim();

  let list = null;
  if (listIdRaw) {
    list = await List.findOne({ _id: listIdRaw, owner: req.user.id });
    if (!list) return res.status(404).json({ message: "List not found" });
  }

  const parsed = parseSpreadsheetBufferToRows(req.file.buffer);
  if (!parsed.length) return res.status(400).json({ message: "No valid rows (need email column)" });

  let count = 0;
  for (const row of parsed) {
    let contact = await Contact.findOne({ owner: req.user.id, email: row.email });
    if (contact) {
      if (row.name) contact.name = row.name;
      if (row.phone) contact.phone = row.phone;
      Object.assign(contact.fields || {}, row.fields || {});
      await contact.save();
      if (list) await attachContactToList(req.user.id, contact._id, list._id);
    } else {
      contact = await Contact.create({
        owner: req.user.id,
        name: row.name,
        email: row.email,
        phone: row.phone || "",
        lists: list ? [list._id] : [],
        fields: row.fields || {},
      });
      if (list) await List.updateOne({ _id: list._id }, { $addToSet: { contacts: contact._id } });
    }
    count += 1;
  }
  res.status(201).json({ list: list || null, count });
};
exports.uploadTemplateImage = async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: "Image file is required" });
  const mime = String(req.file.mimetype || "").toLowerCase();
  if (!mime.startsWith("image/")) return res.status(400).json({ message: "Only image files are allowed" });

  const uploadsDir = path.join(__dirname, "..", "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.writeFile(filepath, req.file.buffer);

  const base =
    (process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  return res.status(201).json({ url: `${base}/uploads/${filename}`, filename });
};
exports.uploadTemplateAttachment = async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: "Attachment file is required" });
  const maxSizeBytes = 10 * 1024 * 1024;
  if (Number(req.file.size || 0) > maxSizeBytes) {
    return res.status(400).json({ message: "Attachment exceeds 10MB limit" });
  }

  const attachmentsDir = path.join(__dirname, "..", "public", "uploads", "attachments");
  await fs.mkdir(attachmentsDir, { recursive: true });

  const originalName = String(req.file.originalname || "attachment").trim() || "attachment";
  const ext = (path.extname(originalName) || "").replace(/[^.a-z0-9]/gi, "").toLowerCase();
  const baseName = path.basename(originalName, ext).replace(/[^a-z0-9-_]/gi, "_").slice(0, 60) || "file";
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${baseName}${ext}`;
  const diskPath = path.join(attachmentsDir, filename);
  await fs.writeFile(diskPath, req.file.buffer);

  const base =
    (process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  return res.status(201).json({
    attachment: {
      name: originalName,
      url: `${base}/uploads/attachments/${filename}`,
      path: diskPath,
      mimeType: String(req.file.mimetype || ""),
      size: Number(req.file.size || 0),
    },
  });
};
exports.getContacts = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 10000);
  const skip = (page - 1) * limit;

  const filter = { owner: req.user.id };
  if (req.query.listId && req.query.listId !== "all") filter.lists = req.query.listId;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Contact.find(filter).populate("lists", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Contact.countDocuments(filter),
  ]);

  return res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
};
exports.getListById = async (req, res) => {
  const list = await List.findOne({ _id: req.params.id, owner: req.user.id }).populate({
    path: "contacts",
    options: { sort: { createdAt: -1 } },
  });
  if (!list) return res.status(404).json({ message: "List not found" });
  return res.json(list);
};
exports.getLists = async (req, res) => res.json(await List.find({ owner: req.user.id }).sort({ createdAt: -1 }));
exports.createList = async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ message: "List name is required" });
  const existing = await List.findOne({ owner: req.user.id, name });
  if (existing) return res.json(existing);
  const list = await List.create({ owner: req.user.id, name });
  return res.status(201).json(list);
};
exports.renameList = async (req, res) => {
  const listId = String(req.params.id || "").trim();
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ message: "List name is required" });

  const list = await List.findOne({ _id: listId, owner: req.user.id });
  if (!list) return res.status(404).json({ message: "List not found" });

  const duplicate = await List.findOne({ owner: req.user.id, name, _id: { $ne: listId } });
  if (duplicate) return res.status(409).json({ message: "A list with this name already exists" });

  list.name = name;
  await list.save();
  return res.json(list);
};
exports.deleteList = async (req, res) => {
  const listId = String(req.params.id || "").trim();
  const list = await List.findOne({ _id: listId, owner: req.user.id }).select("_id name contacts");
  if (!list) return res.status(404).json({ message: "List not found" });

  await Contact.updateMany({ owner: req.user.id, lists: list._id }, { $pull: { lists: list._id } });

  const listContactIds = Array.isArray(list.contacts) ? list.contacts.filter(Boolean) : [];
  if (listContactIds.length) {
    await List.updateMany({ owner: req.user.id }, { $pull: { contacts: { $in: listContactIds } } });
  }

  await List.deleteOne({ _id: listId, owner: req.user.id });
  return res.json({
    message: "List deleted successfully",
    deletedListId: listId,
  });
};

exports.removeContactFromList = async (req, res) => {
  const listId = String(req.params.listId || "").trim();
  const contactId = String(req.params.contactId || "").trim();
  if (!listId || !contactId) return res.status(400).json({ message: "listId and contactId are required" });

  const list = await List.findOne({ _id: listId, owner: req.user.id });
  if (!list) return res.status(404).json({ message: "List not found" });

  const contact = await Contact.findOne({ _id: contactId, owner: req.user.id });
  if (!contact) return res.status(404).json({ message: "Contact not found" });

  await Contact.updateOne({ _id: contactId, owner: req.user.id }, { $pull: { lists: listId } });
  await List.updateOne({ _id: listId, owner: req.user.id }, { $pull: { contacts: contactId } });

  return res.json({ message: "Contact removed from list" });
};
exports.addSingleContact = async (req, res) => {
  const { name, email, listId, listName, fields = {}, phone } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  const phoneTrim = phone != null ? String(phone).trim() : "";
  if (!phoneTrim) return res.status(400).json({ message: "Phone is required" });

  const listIdRaw = listId ? String(listId).trim() : "";
  const listNameRaw = listName != null ? String(listName).trim() : "";

  let resolvedListId = null;
  if (listIdRaw) {
    const listOk = await List.findOne({ _id: listIdRaw, owner: req.user.id });
    if (!listOk) return res.status(400).json({ message: "Invalid list" });
    resolvedListId = listOk._id;
  } else if (listNameRaw) {
    const list =
      (await List.findOne({ owner: req.user.id, name: listNameRaw })) ||
      (await List.create({ owner: req.user.id, name: listNameRaw }));
    resolvedListId = list._id;
  }

  const emailNorm = String(email).toLowerCase().trim();
  let contact = await Contact.findOne({ owner: req.user.id, email: emailNorm });

  if (contact) {
    contact.name = (name || "").trim() || contact.name;
    contact.phone = phoneTrim;
    Object.assign(contact.fields || {}, fields);
    await contact.save();
    if (resolvedListId) await attachContactToList(req.user.id, contact._id, resolvedListId);
  } else {
    contact = await Contact.create({
      owner: req.user.id,
      name: (name || "").trim(),
      email: emailNorm,
      phone: phoneTrim,
      lists: resolvedListId ? [resolvedListId] : [],
      fields,
    });
    if (resolvedListId) {
      await List.updateOne({ _id: resolvedListId }, { $addToSet: { contacts: contact._id } });
    }
  }

  const populated = await Contact.findById(contact._id).populate("lists", "name");
  return res.status(201).json(populated);
};

/** Demo contacts seeded from the Contacts UI (Import → Use Sample Data). */
const SAMPLE_CONTACT_ROWS = [
  { name: "Alex Morgan", phone: "+1 555 201-4401" },
  { name: "Priya Patel", phone: "+44 7700 900321" },
  { name: "Jordan Lee", phone: "+1 555 330-9822" },
  { name: "Sam Rivera", phone: "+34 622 91 8844" },
  { name: "Casey Nguyen", phone: "+61 400 884 921" },
  { name: "Riley Brooks", phone: "+1 555 772-1103" },
  { name: "Morgan Chen", phone: "+49 151 88449201" },
  { name: "Taylor Davis", phone: "+1 555 901-7740" },
];

exports.addSampleContacts = async (req, res) => {
  const hasSampleAlready = await Contact.exists({ owner: req.user.id, isSampleData: true });
  if (hasSampleAlready) {
    return res.status(200).json({ alreadyExists: true, message: "Sample data already added" });
  }

  let ownerLists = await List.find({ owner: req.user.id }).select("_id").lean();
  if (!ownerLists.length) {
    const demo = await List.create({ owner: req.user.id, name: "Demo List" });
    ownerLists = [{ _id: demo._id }];
  }

  const listIdsAll = ownerLists.map((l) => l._id);
  const pickRandomListSubset = () => {
    const n = listIdsAll.length;
    const want = 1 + (n > 1 ? Math.floor(Math.random() * 2) : 0);
    const shuffled = [...listIdsAll].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(want, n));
  };

  const nonce = crypto.randomBytes(6).toString("hex").slice(0, 12);
  const inserted = [];

  for (let i = 0; i < SAMPLE_CONTACT_ROWS.length; i += 1) {
    const row = SAMPLE_CONTACT_ROWS[i];
    const email = `demo.${nonce}.${i}@sendrofy.sample`.toLowerCase();
    const listIds = pickRandomListSubset();
    const contact = await Contact.create({
      owner: req.user.id,
      name: row.name,
      email,
      phone: row.phone,
      lists: [],
      isSampleData: true,
    });
    await Promise.all(listIds.map((lid) => attachContactToList(req.user.id, contact._id, lid)));
    inserted.push(contact._id);
  }

  return res.status(201).json({
    inserted: inserted.length,
    alreadyExists: false,
    message: "Sample data added successfully",
  });
};

exports.bulkContacts = async (req, res) => {
  try {
    const listId = String(req.body.listId || "").trim();
    if (!listId) return res.status(400).json({ message: "listId is required" });
    if (!req.file?.buffer) return res.status(400).json({ message: "file is required" });

    const list = await List.findOne({ _id: listId, owner: req.user.id });
    if (!list) return res.status(404).json({ message: "List not found" });

    const parsed = parseSpreadsheetBufferToRows(req.file.buffer);
    if (!parsed.length) return res.status(400).json({ message: "No valid rows (need email column)" });

    let processed = 0;
    for (const row of parsed) {
      let contact = await Contact.findOne({ owner: req.user.id, email: row.email });
      if (contact) {
        if (row.name) contact.name = row.name;
        if (row.phone) contact.phone = row.phone;
        Object.assign(contact.fields || {}, row.fields || {});
        await contact.save();
        await attachContactToList(req.user.id, contact._id, list._id);
      } else {
        contact = await Contact.create({
          owner: req.user.id,
          name: row.name,
          email: row.email,
          phone: row.phone || "",
          lists: [list._id],
          fields: row.fields || {},
        });
        await List.updateOne({ _id: list._id }, { $addToSet: { contacts: contact._id } });
      }
      processed += 1;
    }

    return res.status(201).json({
      list,
      count: parsed.length,
      inserted: processed,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Bulk import failed" });
  }
};

exports.bulkImportToLists = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "file is required" });
    let listIds = [];
    try {
      const raw = req.body.listIds;
      const parsed = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
      listIds = [...new Set((Array.isArray(parsed) ? parsed : []).map((id) => String(id || "").trim()).filter(Boolean))];
    } catch {
      return res.status(400).json({ message: "listIds must be a valid array" });
    }
    if (!listIds.length) return res.status(400).json({ message: "At least one list must be selected" });

    const lists = await List.find({ owner: req.user.id, _id: { $in: listIds } }).select("_id name");
    if (!lists.length) return res.status(404).json({ message: "Selected lists not found" });
    const validListIds = lists.map((l) => String(l._id));

    const parsedRows = parseSpreadsheetBufferToRows(req.file.buffer);
    if (!parsedRows.length) return res.status(400).json({ message: "No valid rows (need email column)" });

    const savedIds = [];
    for (const row of parsedRows) {
      let contact = await Contact.findOne({ owner: req.user.id, email: row.email });
      if (contact) {
        if (row.name) contact.name = row.name;
        if (row.phone) contact.phone = row.phone;
        Object.assign(contact.fields || {}, row.fields || {});
        await contact.save();
      } else {
        contact = await Contact.create({
          owner: req.user.id,
          name: row.name,
          email: row.email,
          phone: row.phone || "",
          lists: validListIds,
          fields: row.fields || {},
        });
      }

      savedIds.push(contact._id);
      for (const listId of validListIds) {
        await attachContactToList(req.user.id, contact._id, listId);
      }
    }

    return res.status(201).json({
      imported: savedIds.length,
      listIds: validListIds,
      message: "Contacts imported successfully",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Bulk import to lists failed" });
  }
};

exports.addContactsToList = async (req, res) => {
  const listId = req.params.id;
  const { contactIds } = req.body;
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return res.status(400).json({ message: "contactIds must be a non-empty array" });
  }

  const list = await List.findOne({ _id: listId, owner: req.user.id });
  if (!list) return res.status(404).json({ message: "List not found" });

  let modified = 0;
  for (const cid of contactIds) {
    const c = await Contact.findOne({ _id: cid, owner: req.user.id });
    if (!c) continue;
    await attachContactToList(req.user.id, c._id, listId);
    modified += 1;
  }

  return res.json({ modifiedCount: modified, matchedCount: modified });
};

exports.bulkAssignContactsToLists = async (req, res) => {
  const rawContactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
  const rawListIds = Array.isArray(req.body.listIds) ? req.body.listIds : [];

  const contactIds = [...new Set(rawContactIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const listIds = [...new Set(rawListIds.map((id) => String(id || "").trim()).filter(Boolean))];

  if (!contactIds.length) return res.status(400).json({ message: "contactIds must contain at least one id" });
  if (!listIds.length) return res.status(400).json({ message: "listIds must contain at least one id" });

  const lists = await List.find({ owner: req.user.id, _id: { $in: listIds } }).select("_id").lean();
  if (lists.length !== listIds.length) {
    return res.status(404).json({ message: "One or more lists were not found" });
  }

  let assignmentsAdded = 0;
  let assignmentsSkipped = 0;
  let contactsTouched = 0;

  for (const cid of contactIds) {
    const contact = await Contact.findOne({ _id: cid, owner: req.user.id }).select("_id lists").lean();
    if (!contact) continue;
    contactsTouched += 1;

    const onListIds = new Set((contact.lists || []).map((lid) => String(lid)));

    for (const listId of listIds) {
      const lid = String(listId);
      if (onListIds.has(lid)) {
        assignmentsSkipped += 1;
        continue;
      }
      await attachContactToList(req.user.id, contact._id, listId);
      assignmentsAdded += 1;
      onListIds.add(lid);
    }
  }

  if (!contactsTouched) {
    return res.status(400).json({ message: "No matching contacts found for the given ids" });
  }

  const totalPairsRequested = contactsTouched * listIds.length;

  let message =
    assignmentsAdded === 0
      ? "All selected contacts were already on the chosen lists."
      : assignmentsSkipped === 0
        ? "Contacts added to selected lists"
        : `Added ${assignmentsAdded} new list assignment${assignmentsAdded !== 1 ? "s" : ""}. ${assignmentsSkipped} ${
            assignmentsSkipped === 1 ? "was" : "were"
          } already on those lists (no change).`;

  return res.json({
    message,
    contactsUpdated: contactsTouched,
    assignmentsAdded,
    assignmentsSkipped,
    /** Every (contact × list) pair we evaluated (excluding unknown contacts). */
    pairsEvaluated: totalPairsRequested,
  });
};

exports.updateContact = async (req, res) => {
  const { name, email, phone } = req.body;
  const contact = await Contact.findOne({ _id: req.params.id, owner: req.user.id });
  if (!contact) return res.status(404).json({ message: "Contact not found" });

  const nameTrim = name != null ? String(name).trim() : "";
  const emailTrim = email != null ? String(email).toLowerCase().trim() : "";
  const phoneTrim = phone != null ? String(phone).trim() : "";

  if (!emailTrim) return res.status(400).json({ message: "Email is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  if (!phoneTrim) return res.status(400).json({ message: "Phone is required" });

  const dup = await Contact.findOne({ owner: req.user.id, email: emailTrim, _id: { $ne: contact._id } });
  if (dup) return res.status(409).json({ message: "A contact with this email already exists" });

  contact.name = nameTrim;
  contact.email = emailTrim;
  contact.phone = phoneTrim;
  await contact.save();

  const populated = await Contact.findById(contact._id).populate("lists", "name");
  return res.json(populated);
};

exports.deleteContact = async (req, res) => {
  const id = req.params.id;
  const deleted = await Contact.findOneAndDelete({ _id: id, owner: req.user.id });
  if (!deleted) return res.status(404).json({ message: "Contact not found" });
  await List.updateMany({ contacts: id }, { $pull: { contacts: id } });
  return res.json({ message: "Contact deleted" });
};

exports.createTemplate = async (req, res) => {
  const t = await Template.create({
    owner: req.user.id,
    name: req.body.name,
    subject: req.body.subject,
    html: sanitizeTemplateHtml(req.body.html),
    attachments: normalizeTemplateAttachments(req.body.attachments),
  });
  res.status(201).json(t);
};
exports.getTemplates = async (req, res) => res.json(await Template.find({ owner: req.user.id }).sort({ createdAt: -1 }));
exports.updateTemplate = async (req, res) => {
  const updated = await Template.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    {
      name: req.body.name,
      subject: req.body.subject,
      html: sanitizeTemplateHtml(req.body.html),
      attachments: normalizeTemplateAttachments(req.body.attachments),
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ message: "Template not found" });
  return res.json(updated);
};
exports.deleteTemplate = async (req, res) => {
  const deleted = await Template.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
  if (!deleted) return res.status(404).json({ message: "Template not found" });
  return res.json({ message: "Template deleted" });
};

exports.createCampaign = async (req, res) => {
  const rawListIds = Array.isArray(req.body.listIds) ? req.body.listIds : req.body.listId ? [req.body.listId] : [];
  const listIds = [...new Set(rawListIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!req.body.name || !req.body.templateId || !listIds.length) {
    return res.status(400).json({ message: "name, templateId and at least one listId are required" });
  }
  const c = await Campaign.create({
    owner: req.user.id,
    name: req.body.name,
    templateId: req.body.templateId,
    listId: listIds[0],
    listIds,
    status: "draft",
  });
  res.status(201).json(c);
};
exports.sendCampaign = async (req, res) => {
  const campaign = await Campaign.findById(req.body.campaignId);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  // Mark as sending before enqueueing. In direct mode the worker may complete immediately,
  // and setting `sending` afterwards would overwrite the final `completed/failed` status.
  campaign.status = "sending";
  await campaign.save();
  const result = await enqueueCampaign(campaign._id);
  // If queue is disabled (direct mode), the campaign status will already be updated
  // by the worker to completed/failed. Only force "sending" when actually queued.
  if (result?.queued) {
    campaign.status = "sending";
    await campaign.save();
  }
  res.json({ message: result.queued ? "Campaign queued" : "Campaign sent immediately (queue disabled)" });
};
exports.getCampaigns = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100);
  const skip = (page - 1) * limit;
  const filter = { owner: req.user.id };
  const status = req.query.status;
  if (status && ["draft", "sending", "completed", "failed"].includes(status)) filter.status = status;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.name = { $regex: q, $options: "i" };
  }

  const [items, total] = await Promise.all([
    Campaign.find(filter)
      .populate("templateId", "name")
      .populate("listId", "name")
      .populate("listIds", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Campaign.countDocuments(filter),
  ]);

  // Self-heal old "sending" campaigns (e.g. previously overwritten in direct mode).
  // This does not change the send flow; it just aligns campaign status with existing logs.
  const now = Date.now();
  for (const c of items) {
    if (c.status !== "sending") continue;
    if (now - new Date(c.updatedAt).getTime() < 30_000) continue;
    const [anySent, anyFailed] = await Promise.all([
      EmailLog.exists({ owner: req.user.id, campaignId: c._id, status: "sent" }).catch(() => null),
      EmailLog.exists({ owner: req.user.id, campaignId: c._id, status: "failed" }).catch(() => null),
    ]);
    const nextStatus = anySent ? "completed" : anyFailed ? "failed" : null;
    if (!nextStatus) continue;
    c.status = nextStatus;
    await Campaign.updateOne({ _id: c._id, owner: req.user.id }, { $set: { status: nextStatus } }).catch(() => null);
  }

  return res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
};

exports.getCampaignDetails = async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user.id })
    .populate("templateId", "name subject")
    .populate("listId", "name")
    .populate("listIds", "name");
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const campaignOid = campaign._id;

  const countAgg = await EventLog.aggregate([
    { $match: { campaignId: campaignOid } },
    { $group: { _id: "$eventType", count: { $sum: 1 } } },
  ]);
  const eventCountsRaw = {};
  countAgg.forEach((x) => {
    eventCountsRaw[x._id] = x.count;
  });

  const bounceUnion =
    (eventCountsRaw.hard_bounce || 0) +
    (eventCountsRaw.soft_bounce || 0) +
    (eventCountsRaw.hard_bounced || 0) +
    (eventCountsRaw.soft_bounced || 0) +
    (eventCountsRaw.bounced || 0);

  const eventCounts = {
    delivered: eventCountsRaw.delivered || 0,
    opened: eventCountsRaw.opened || 0,
    clicked: eventCountsRaw.clicked || 0,
    bounced: bounceUnion,
    complaint: eventCountsRaw.complaint || 0,
    unsubscribed: eventCountsRaw.unsubscribed || 0,
    deferred: eventCountsRaw.deferred || 0,
    error: eventCountsRaw.error || 0,
    sent: eventCountsRaw.sent || 0,
  };

  const timelineRangeKey = normalizeRange(req.query.range);
  const timelineBuild = await buildEngagementTimeline(EventLog, campaignOid, timelineRangeKey);
  /** @deprecated Use timeline rows + timelineMeta; kept for older clients expecting `date` on 7d daily rows */
  const timeline = timelineBuild.timeline.map((row) => ({
    ...(row.granularity === "day" && row.date ? { date: row.date } : {}),
    bucket: row.bucket,
    dateStart: row.dateStart || null,
    dateEnd: row.dateEnd || null,
    granularity: row.granularity,
    delivered: row.delivered,
    opened: row.opened,
    clicked: row.clicked,
  }));
  const timelineMeta = {
    range: timelineBuild.range,
    granularity: timelineBuild.granularity,
  };

  /** ObjectIds required here: Mongoose casts `find()` filters but not `aggregate()` $match. */
  const ownerOid = new mongoose.Types.ObjectId(String(req.user.id));
  const logMatch = { owner: ownerOid, campaignId: campaignOid };

  const [statsRow] = await EmailLog.aggregate([
    { $match: logMatch },
    { $addFields: { sl: { $toLower: { $ifNull: ["$status", ""] } } } },
    {
      $group: {
        _id: null,
        sent: { $sum: 1 },
        delivered: {
          $sum: {
            $cond: [{ $in: ["$sl", ["delivered", "opened", "clicked"]] }, 1, 0],
          },
        },
        opened: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$opened", true] }, { $in: ["$sl", ["opened", "clicked"]] }],
              },
              1,
              0,
            ],
          },
        },
        clicked: {
          $sum: {
            $cond: [{ $or: [{ $eq: ["$clicked", true] }, { $eq: ["$sl", "clicked"] }] }, 1, 0],
          },
        },
        bounced: {
          $sum: { $cond: [{ $eq: ["$sl", "bounced"] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $in: ["$sl", ["failed", "error"]] }, 1, 0] },
        },
      },
    },
  ]).exec();

  const logCount = await EmailLog.countDocuments(logMatch);

  const stats = statsRow
    ? {
        sent: logCount,
        delivered: statsRow.delivered,
        opened: statsRow.opened,
        clicked: statsRow.clicked,
        bounced: statsRow.bounced,
        failed: statsRow.failed,
      }
    : { sent: logCount, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };

  const recipientTotal = logCount;
  const recipientLimit = Math.min(Math.max(parseInt(req.query.recipientsLimit || "25", 10), 1), 100);
  const recipientTotalPages = Math.max(Math.ceil(recipientTotal / recipientLimit), 1);
  const recipientPage = Math.min(
    Math.max(parseInt(req.query.recipientsPage || "1", 10), 1),
    recipientTotalPages
  );
  const recipientSkip = (recipientPage - 1) * recipientLimit;

  const logs = await EmailLog.find(logMatch)
    .sort({ lastEventAt: -1, sentAt: -1, createdAt: -1 })
    .skip(recipientSkip)
    .limit(recipientLimit)
    .lean();

  const recipients = logs.map((l) => ({
    _id: l._id,
    email: l.email,
    status: l.status,
    opened: !!l.opened,
    clicked: !!l.clicked,
    sentAt: l.sentAt || l.createdAt,
    openedAt: l.openedAt || null,
    clickedAt: l.clickedAt || null,
    lastEventTime: l.lastEventAt || l.clickedAt || l.openedAt || l.sentAt || l.createdAt,
    createdAt: l.createdAt,
  }));

  const recipientsPagination = {
    page: recipientPage,
    limit: recipientLimit,
    total: recipientTotal,
    totalPages: recipientTotalPages,
    hasNextPage: recipientPage < recipientTotalPages,
    hasPrevPage: recipientPage > 1,
  };

  return res.json({
    campaign,
    stats,
    eventCounts,
    eventCountsRaw,
    timeline,
    timelineMeta,
    recipients,
    contacts: recipients,
    recipientsPagination,
  });
};

exports.getCampaignRecipientTimeline = async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user.id }).select("_id").lean();
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const decodedEmail = decodeURIComponent(String(req.params.email || "")).trim().toLowerCase();
  if (!decodedEmail) return res.json({ email: "", events: [] });

  const events = await EventLog.find({ campaignId: campaign._id, email: decodedEmail })
    .sort({ timestamp: 1, createdAt: 1 })
    .select("eventType timestamp metadata")
    .lean();

  return res.json({
    email: decodedEmail,
    events: events.map((e) => ({
      type: e.eventType,
      timestamp: e.timestamp,
      metadata: e.metadata || {},
    })),
  });
};

exports.exportCampaignData = async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, owner: req.user.id }).select("_id name").lean();
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const [logs, events] = await Promise.all([
    EmailLog.find({ owner: req.user.id, campaignId: campaign._id }).lean(),
    EventLog.find({ campaignId: campaign._id }).lean(),
  ]);

  const eventByEmail = new Map();
  for (const ev of events) {
    const email = String(ev.email || "").toLowerCase();
    if (!email) continue;
    if (!eventByEmail.has(email)) {
      eventByEmail.set(email, {
        deliveredAt: null,
        bounced: false,
        error: false,
        openCount: 0,
        clickCount: 0,
        timeline: [],
      });
    }
    const bucket = eventByEmail.get(email);
    const eventType = String(ev.eventType || "").toLowerCase();
    const ts = ev.timestamp ? new Date(ev.timestamp) : null;
    if (eventType === "delivered" && !bucket.deliveredAt && ts) bucket.deliveredAt = ts;
    if (eventType.includes("bounce")) bucket.bounced = true;
    if (eventType === "error") bucket.error = true;
    if (eventType === "opened" || eventType === "unique_open" || eventType === "unique_opened") bucket.openCount += 1;
    if (eventType === "clicked") bucket.clickCount += 1;
    if (eventType) bucket.timeline.push({ eventType, timestamp: ts });
  }

  const safe = (value) => {
    const str = value == null ? "" : String(value);
    const escaped = str.replace(/"/g, "\"\"");
    return `"${escaped}"`;
  };
  const fmtDate = (d) => (d ? new Date(d).toISOString() : "");

  const headers = [
    "Email",
    "Status",
    "Sent At",
    "Delivered At",
    "Opened At",
    "Clicked At",
    "Bounce",
    "Error",
    "Total Opens",
    "Total Clicks",
    "Events",
  ];

  const rows = logs.map((log) => {
    const email = String(log.email || "").toLowerCase();
    const agg = eventByEmail.get(email) || { deliveredAt: null, bounced: false, error: false, openCount: 0, clickCount: 0, timeline: [] };
    const timelineText = agg.timeline
      .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
      .map((x) => x.eventType)
      .join(" > ");
    return [
      safe(email),
      safe(log.status || ""),
      safe(fmtDate(log.sentAt || log.createdAt)),
      safe(fmtDate(agg.deliveredAt)),
      safe(fmtDate(log.openedAt)),
      safe(fmtDate(log.clickedAt)),
      safe(agg.bounced ? "yes" : "no"),
      safe(agg.error ? "yes" : "no"),
      safe(agg.openCount),
      safe(agg.clickCount),
      safe(timelineText),
    ].join(",");
  });

  const csv = [headers.map(safe).join(","), ...rows].join("\n");
  const filename = `${String(campaign.name || "campaign").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-data.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(csv);
};

exports.getStats = async (req, res) => {
  const logs = await EmailLog.find({ owner: req.user.id });
  res.json({
    totalSent: logs.filter((x) => x.status === "sent").length,
    opened: logs.filter((x) => x.opened).length,
    clicked: logs.filter((x) => x.clicked).length,
    failed: logs.filter((x) => x.status === "failed").length,
  });
};

exports.getDashboardStats = async (req, res) => {
  const owner = req.user.id;
  const campaigns = await Campaign.find({ owner }).select("_id name").lean();

  const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
    EmailLog.countDocuments({ owner }),
    EmailLog.countDocuments({ owner, opened: true }),
    EmailLog.countDocuments({ owner, clicked: true }),
    EmailLog.countDocuments({ owner, status: "bounced" }),
  ]);

  const deliveredStatuses = ["delivered", "opened", "clicked"];
  const totalDelivered = await EmailLog.countDocuments({ owner, status: { $in: deliveredStatuses } });
  const openRate = totalDelivered ? Number(((totalOpened / totalDelivered) * 100).toFixed(2)) : 0;
  const clickRate = totalDelivered ? Number(((totalClicked / totalDelivered) * 100).toFixed(2)) : 0;

  const now = new Date();
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - 6);
  startUtc.setUTCHours(0, 0, 0, 0);

  const weeklyStats = await buildEmailLogWeeklyStats(owner, startUtc, endUtc, 7);

  const ownerOid = new mongoose.Types.ObjectId(String(owner));
  const campaignAgg = await EmailLog.aggregate([
    { $match: { owner: ownerOid } },
    {
      $group: {
        _id: "$campaignId",
        opened: { $sum: { $cond: ["$opened", 1, 0] } },
        clicked: { $sum: { $cond: ["$clicked", 1, 0] } },
      },
    },
    { $sort: { opened: -1, clicked: -1 } },
    { $limit: 8 },
  ]);

  const campaignNameMap = new Map(campaigns.map((c) => [String(c._id), c.name]));
  const campaignStats = campaignAgg.map((row) => ({
    campaignId: row._id,
    campaignName: campaignNameMap.get(String(row._id)) || "Untitled campaign",
    opened: row.opened || 0,
    clicked: row.clicked || 0,
  }));

  return res.json({
    totalSent,
    totalDelivered,
    totalOpened,
    totalClicked,
    totalBounced,
    openRate,
    clickRate,
    weeklyStats,
    campaignStats,
  });
};

exports.getDashboardSummary = async (req, res) => {
  const owner = req.user.id;
  const rangeRaw = parseInt(String(req.query.range ?? "7"), 10);
  const engagementDays = [1, 7, 30, 90].includes(rangeRaw) ? rangeRaw : 7;

  const campaignsPromise = Campaign.find({ owner })
    .populate("templateId", "name")
    .populate("listId", "name")
    .populate("listIds", "name")
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  const contactsPromise = Contact.find({ owner })
    .populate("lists", "name createdAt")
    .select("lists")
    .limit(500)
    .lean();

  const [stats, campaigns, contacts] = await Promise.all([
    (async () => {
      const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
        EmailLog.countDocuments({ owner }),
        EmailLog.countDocuments({ owner, opened: true }),
        EmailLog.countDocuments({ owner, clicked: true }),
        EmailLog.countDocuments({ owner, status: "bounced" }),
      ]);
      const deliveredStatuses = ["delivered", "opened", "clicked"];
      const totalDelivered = await EmailLog.countDocuments({ owner, status: { $in: deliveredStatuses } });
      const openRate = totalDelivered ? Number(((totalOpened / totalDelivered) * 100).toFixed(2)) : 0;
      const clickRate = totalDelivered ? Number(((totalClicked / totalDelivered) * 100).toFixed(2)) : 0;

      const now = new Date();
      const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const startUtc = new Date(endUtc);
      startUtc.setUTCDate(startUtc.getUTCDate() - (engagementDays - 1));
      startUtc.setUTCHours(0, 0, 0, 0);

      const weeklyStats = await buildEmailLogWeeklyStats(owner, startUtc, endUtc, engagementDays);

      const ownerOid = new mongoose.Types.ObjectId(String(owner));
      const campaignAgg = await EmailLog.aggregate([
        { $match: { owner: ownerOid } },
        {
          $group: {
            _id: "$campaignId",
            opened: { $sum: { $cond: ["$opened", 1, 0] } },
            clicked: { $sum: { $cond: ["$clicked", 1, 0] } },
          },
        },
        { $sort: { opened: -1, clicked: -1 } },
        { $limit: 8 },
      ]);

      const campaignNameMap = new Map((await Campaign.find({ owner }).select("_id name").lean()).map((c) => [String(c._id), c.name]));
      const campaignStats = campaignAgg.map((row) => ({
        campaignId: row._id,
        campaignName: campaignNameMap.get(String(row._id)) || "Untitled campaign",
        opened: row.opened || 0,
        clicked: row.clicked || 0,
      }));

      return {
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalBounced,
        openRate,
        clickRate,
        weeklyStats,
        campaignStats,
      };
    })(),
    campaignsPromise,
    contactsPromise,
  ]);

  const audienceMap = new Map();
  contacts.forEach((contact) => {
    const refs = Array.isArray(contact?.lists) ? contact.lists : [];
    refs.forEach((ref) => {
      const id = String(ref?._id || ref || "");
      if (!id) return;
      const name = ref?.name || `List ${id.slice(-4)}`;
      const prev = audienceMap.get(id) || { id, name, count: 0, createdAt: ref?.createdAt || null };
      prev.count += 1;
      if (ref?.createdAt) prev.createdAt = ref.createdAt;
      audienceMap.set(id, prev);
    });
  });

  return res.json({
    ...stats,
    campaigns,
    contactsCount: contacts.length,
    audienceRows: Array.from(audienceMap.values()).sort((a, b) => b.count - a.count).slice(0, 5),
  });
};
exports.getLogs = async (req, res) =>
  res.json(
    await EmailLog.find({ owner: req.user.id })
      .populate("campaignId", "name")
      .sort({ createdAt: -1 })
  );

exports.trackOpen = async (req, res) => {
  await EmailLog.findByIdAndUpdate(req.params.id, { opened: true });
  res.set("Content-Type", "image/gif");
  res.send(Buffer.from("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"));
};
exports.trackClick = async (req, res) => {
  await EmailLog.findByIdAndUpdate(req.params.id, { clicked: true });
  res.redirect(req.query.url ? decodeURIComponent(req.query.url) : process.env.CLIENT_URL);
};
