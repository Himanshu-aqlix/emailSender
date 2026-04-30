const mongoose = require("mongoose");
const EmailLog = require("../models/EmailLog");
const EventLog = require("../models/EventLog");

const normTags = (e) => {
  const raw = e?.tags;
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  return [];
};

const extractCampaignIdFromTags = (tags) => {
  const campaignTag = tags.find((t) => String(t).toLowerCase().startsWith("campaign:"));
  if (campaignTag) return String(campaignTag).replace(/^campaign:/i, "").trim();
  const cidTag = tags.find((t) => String(t).toLowerCase().startsWith("cid:"));
  if (cidTag) return String(cidTag).replace(/^cid:/i, "").trim();
  return null;
};

/**
 * Normalize webhook event name for EventLog storage and EmailLog.events counters.
 */
const normalizeEventType = (rawEvent, e) => {
  let ev = String(rawEvent || "").toLowerCase().trim();
  const sub = String(e?.subEvent || e?.subevent || e?.reason || "").toLowerCase();
  if (ev === "open") ev = "opened";
  if (ev === "click") ev = "clicked";
  if (ev === "hard_bounce" || ev === "soft_bounce") return ev;
  if (ev === "bounce" && sub.includes("soft")) return "soft_bounce";
  if (ev === "bounce" && sub.includes("hard")) return "hard_bounce";
  if (!ev && sub.includes("bounce")) return sub.includes("soft") ? "soft_bounce" : "hard_bounce";
  return ev || "unknown";
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());

async function applyEmailLogEventUpdate(logDoc, eventType, timestamp) {
  const currentStatus = String(logDoc.status || "sent").toLowerCase();
  const event = String(eventType || "").toLowerCase();
  const $set = { lastEventAt: timestamp };
  const $inc = { [`events.${eventType}`]: 1 };

  if (event === "clicked") {
    $set.status = "clicked";
    $set.clicked = true;
    $set.clickedAt = timestamp;
  } else if (event === "opened") {
    if (currentStatus !== "delivered") {
      console.log("⚠️ Ignoring open (not delivered yet)");
      return;
    }
    $set.opened = true;
    $set.openedAt = timestamp;
    if (currentStatus !== "clicked") $set.status = "opened";
  } else if (event === "delivered") {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "delivered";
  } else if (event.includes("bounce")) {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "bounced";
  } else if (["complaint", "spam", "abuse", "complained"].includes(event)) {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "complaint";
  } else if (["unsubscribed", "unsubscribe", "list_unsubscribe"].includes(event)) {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "unsubscribed";
  } else if (event === "deferred") {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "deferred";
  } else if (["error", "invalid", "blocked"].includes(event)) {
    if (!["clicked", "opened"].includes(currentStatus)) $set.status = "error";
  }

  await EmailLog.updateOne({ _id: logDoc._id }, { $set, $inc });
}

/**
 * Process a single Brevo webhook payload object.
 */
async function processBrevoEventPayload(e) {
  const rawEvent = (e?.event || e?.type || e?.eventType || "").toLowerCase();
  const eventType = normalizeEventType(rawEvent, e);
  const emailRaw = (e?.email || e?.recipient || "").toLowerCase().trim();
  const timestamp = new Date(e?.date || e?.ts || Date.now());
  const tags = normTags(e);
  const logTag = tags.find((t) => String(t).toLowerCase().startsWith("log:"));
  const logId = logTag ? String(logTag).replace(/^log:/i, "").trim() : null;

  let campaignIdStr = extractCampaignIdFromTags(tags);

  let logDoc = null;
  if (logId && mongoose.Types.ObjectId.isValid(logId)) {
    logDoc = await EmailLog.findById(logId);
  }
  if (emailRaw && !isValidEmail(emailRaw)) {
    console.log("❌ Invalid email, skipping:", emailRaw);
    return;
  }
  if (!campaignIdStr && logDoc) campaignIdStr = String(logDoc.campaignId);

  if (!campaignIdStr || !mongoose.Types.ObjectId.isValid(campaignIdStr)) {
    if (logDoc) await applyEmailLogEventUpdate(logDoc, eventType, timestamp);
    return;
  }

  const campaignId = new mongoose.Types.ObjectId(campaignIdStr);

  const query = logId && mongoose.Types.ObjectId.isValid(logId)
    ? { _id: new mongoose.Types.ObjectId(logId) }
    : { email: emailRaw, campaignId };

  console.log("EVENT:", eventType);
  console.log("EMAIL:", emailRaw);
  console.log("LOG ID:", logId || "n/a");
  console.log("QUERY:", query);

  if (!logDoc) {
    logDoc = await EmailLog.findOne(query);
  }

  const owner = logDoc?.owner;
  const email = emailRaw || (logDoc?.email ? String(logDoc.email).toLowerCase() : "");

  await EventLog.create({
    owner: owner || undefined,
    campaignId,
    email: email || "unknown",
    eventType,
    timestamp,
    metadata: e,
  });

  if (logDoc) {
    const fresh = await EmailLog.findOne(query);
    if (fresh) await applyEmailLogEventUpdate(fresh, eventType, timestamp);
  } else if (emailRaw) {
    await EmailLog.updateOne(
      query,
      {
        $set: { lastEventAt: timestamp },
        $inc: { [`events.${eventType}`]: 1 },
      }
    );
  }
}

async function processBrevoWebhookBody(body) {
  const events = Array.isArray(body) ? body : [body];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (!ev || typeof ev !== "object") continue;
    try {
      await processBrevoEventPayload(ev);
    } catch (err) {
      console.error(`[brevo webhook] event ${i + 1}/${events.length}:`, err?.message || err);
    }
  }
}

/** Pixel / tracked-link engagement (creates EventLog + applies same status rules). */
async function recordTrackingEngagement(logId, eventType) {
  if (!logId || !mongoose.Types.ObjectId.isValid(String(logId))) return;
  const timestamp = new Date();
  const logDoc = await EmailLog.findById(logId);
  if (!logDoc) return;
  await EventLog.create({
    owner: logDoc.owner,
    campaignId: logDoc.campaignId,
    email: String(logDoc.email).toLowerCase(),
    eventType,
    timestamp,
    metadata: { source: "tracking" },
  });
  const fresh = await EmailLog.findById(logId);
  if (fresh) await applyEmailLogEventUpdate(fresh, eventType, timestamp);
}

module.exports = {
  processBrevoWebhookBody,
  normalizeEventType,
  extractCampaignIdFromTags,
  recordTrackingEngagement,
};
