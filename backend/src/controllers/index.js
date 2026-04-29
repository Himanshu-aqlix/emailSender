const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const sanitizeHtml = require("sanitize-html");
const User = require("../models/User");
const List = require("../models/List");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Campaign = require("../models/Campaign");
const EmailLog = require("../models/EmailLog");
const { enqueueCampaign } = require("../queues/emailQueue");

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

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
  const requestedName = (req.body.listName || `List ${Date.now()}`).trim();
  let list = await List.findOne({ owner: req.user.id, name: requestedName });
  if (!list) list = await List.create({ owner: req.user.id, name: requestedName });
  const parsed = parseSpreadsheetBufferToRows(req.file.buffer);
  let count = 0;
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
    count += 1;
  }
  res.status(201).json({ list, count });
};
exports.getContacts = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100);
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
exports.addSingleContact = async (req, res) => {
  const { name, email, listId, listName, fields = {}, phone } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  const phoneTrim = phone != null ? String(phone).trim() : "";
  if (!phoneTrim) return res.status(400).json({ message: "Phone is required" });

  let resolvedListId = listId;
  if (!resolvedListId) {
    if (!listName) return res.status(400).json({ message: "listId or listName is required" });
    const listLabel = listName.trim();
    const list =
      (await List.findOne({ owner: req.user.id, name: listLabel })) ||
      (await List.create({ owner: req.user.id, name: listLabel }));
    resolvedListId = list._id;
  } else {
    const listOk = await List.findOne({ _id: resolvedListId, owner: req.user.id });
    if (!listOk) return res.status(400).json({ message: "Invalid list" });
  }

  const emailNorm = String(email).toLowerCase().trim();
  let contact = await Contact.findOne({ owner: req.user.id, email: emailNorm });

  if (contact) {
    contact.name = (name || "").trim() || contact.name;
    contact.phone = phoneTrim;
    Object.assign(contact.fields || {}, fields);
    await contact.save();
    await attachContactToList(req.user.id, contact._id, resolvedListId);
  } else {
    contact = await Contact.create({
      owner: req.user.id,
      name: (name || "").trim(),
      email: emailNorm,
      phone: phoneTrim,
      lists: [resolvedListId],
      fields,
    });
    await List.updateOne({ _id: resolvedListId }, { $addToSet: { contacts: contact._id } });
  }

  const populated = await Contact.findById(contact._id).populate("lists", "name");
  return res.status(201).json(populated);
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

exports.updateContact = async (req, res) => {
  const { name, email, phone } = req.body;
  const contact = await Contact.findOne({ _id: req.params.id, owner: req.user.id });
  if (!contact) return res.status(404).json({ message: "Contact not found" });

  if (name != null) contact.name = String(name).trim();
  if (email != null) contact.email = String(email).toLowerCase().trim();
  if (phone != null) contact.phone = String(phone).trim();
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
    html: sanitizeHtml(req.body.html),
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
      html: sanitizeHtml(req.body.html),
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
  if (!req.body.name || !req.body.templateId || !req.body.listId) {
    return res.status(400).json({ message: "name, templateId and listId are required" });
  }
  const c = await Campaign.create({ owner: req.user.id, name: req.body.name, templateId: req.body.templateId, listId: req.body.listId, status: "draft" });
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

exports.getStats = async (req, res) => {
  const logs = await EmailLog.find({ owner: req.user.id });
  res.json({
    totalSent: logs.filter((x) => x.status === "sent").length,
    opened: logs.filter((x) => x.opened).length,
    clicked: logs.filter((x) => x.clicked).length,
    failed: logs.filter((x) => x.status === "failed").length,
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
