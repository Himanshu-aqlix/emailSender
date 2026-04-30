const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const { sanitizeTemplateHtml } = require("../utils/sanitizeTemplateHtml");
const User = require("../models/User");
const List = require("../models/List");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Campaign = require("../models/Campaign");
const EmailLog = require("../models/EmailLog");
const EventLog = require("../models/EventLog");
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

  const contactsInList = await Contact.find({ owner: req.user.id, lists: list._id }).select("_id");
  const contactIds = contactsInList.map((c) => c._id);
  if (contactIds.length) {
    await Contact.deleteMany({ owner: req.user.id, _id: { $in: contactIds } });
    await List.updateMany({ owner: req.user.id }, { $pull: { contacts: { $in: contactIds } } });
  }

  await List.deleteOne({ _id: listId, owner: req.user.id });
  return res.json({
    message: "List deleted successfully",
    deletedListId: listId,
    deletedContacts: contactIds.length,
  });
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
    html: sanitizeTemplateHtml(req.body.html),
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

  const now = new Date();
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - 6);
  startUtc.setUTCHours(0, 0, 0, 0);

  const timelineAgg = await EventLog.aggregate([
    {
      $match: {
        campaignId: campaignOid,
        timestamp: { $gte: startUtc, $lte: endUtc },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        delivered: { $sum: { $cond: [{ $eq: ["$eventType", "delivered"] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $eq: ["$eventType", "opened"] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $eq: ["$eventType", "clicked"] }, 1, 0] } },
      },
    },
  ]);

  const dayKeys = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startUtc);
    d.setUTCDate(d.getUTCDate() + i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const byDay = Object.fromEntries(timelineAgg.map((r) => [r._id, r]));
  const timeline = dayKeys.map((date) => {
    const row = byDay[date] || {};
    return {
      date,
      delivered: row.delivered || 0,
      opened: row.opened || 0,
      clicked: row.clicked || 0,
    };
  });

  const logs = await EmailLog.find({ owner: req.user.id, campaignId: campaignOid })
    .sort({ lastEventAt: -1, sentAt: -1, createdAt: -1 })
    .lean();

  const st = (s) => String(s || "").toLowerCase();
  const stats = {
    sent: logs.length,
    delivered: logs.filter((l) => ["delivered", "opened", "clicked"].includes(st(l.status))).length,
    opened: logs.filter((l) => l.opened || ["opened", "clicked"].includes(st(l.status))).length,
    clicked: logs.filter((l) => l.clicked || st(l.status) === "clicked").length,
    bounced: logs.filter((l) => st(l.status) === "bounced").length,
    failed: logs.filter((l) => ["failed", "error"].includes(st(l.status))).length,
  };

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

  return res.json({
    campaign,
    stats,
    eventCounts,
    eventCountsRaw,
    timeline,
    recipients,
    contacts: recipients,
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
  const campaignIds = campaigns.map((c) => c._id);

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

  const weeklyAgg = await EventLog.aggregate([
    {
      $match: {
        campaignId: { $in: campaignIds },
        timestamp: { $gte: startUtc, $lte: endUtc },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        sent: { $sum: { $cond: [{ $eq: ["$eventType", "sent"] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $eq: ["$eventType", "opened"] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $eq: ["$eventType", "clicked"] }, 1, 0] } },
      },
    },
  ]);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startUtc);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const weeklyByDay = Object.fromEntries(weeklyAgg.map((x) => [x._id, x]));
  const weeklyStats = days.map((date) => {
    const row = weeklyByDay[date] || {};
    return {
      date,
      sent: row.sent || 0,
      opened: row.opened || 0,
      clicked: row.clicked || 0,
    };
  });

  const campaignAgg = await EventLog.aggregate([
    {
      $match: {
        campaignId: { $in: campaignIds },
      },
    },
    {
      $group: {
        _id: "$campaignId",
        opened: { $sum: { $cond: [{ $eq: ["$eventType", "opened"] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $eq: ["$eventType", "clicked"] }, 1, 0] } },
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
