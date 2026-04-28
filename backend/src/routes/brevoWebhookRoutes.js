const express = require("express");
const EmailLog = require("../models/EmailLog");

const router = express.Router();

const asArray = (payload) => (Array.isArray(payload) ? payload : payload ? [payload] : []);

const pickEventName = (e) =>
  String(e?.event || e?.type || e?.eventType || e?.name || "")
    .trim()
    .toLowerCase();

const parseTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
};

const extractTagValue = (tags, prefix) => {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

router.post("/webhook/brevo", async (req, res) => {
  // Always respond quickly so Brevo doesn't retry aggressively.
  res.status(200).json({ ok: true });

  try {
    const events = asArray(req.body);
    if (events.length) {
      console.log(`[brevo-webhook] received ${events.length} event(s)`);
    }
    for (const e of events) {
      const eventName = pickEventName(e);
      const email = String(e?.email || e?.recipient || e?.to || "").trim().toLowerCase();
      const tags = parseTags(e?.tags || e?.tag);
      const logId = extractTagValue(tags, "log:");

      const when =
        e?.date ? new Date(e.date) :
        e?.event_date ? new Date(e.event_date) :
        e?.ts ? new Date(Number(e.ts) * 1000) :
        new Date();

      if (!logId && !email) continue;

      const query = logId ? { _id: logId } : { email };
      const update = {};

      if (eventName === "delivered") {
        update.status = "delivered";
      } else if (eventName === "bounced" || eventName === "hard_bounce" || eventName === "soft_bounce") {
        update.status = "bounced";
      } else if (eventName === "opened" || eventName === "open") {
        update.opened = true;
        update.openedAt = when;
      } else if (eventName === "clicked" || eventName === "click") {
        update.clicked = true;
        update.clickedAt = when;
      } else {
        continue;
      }

      await EmailLog.findOneAndUpdate(query, { $set: update }).catch(() => null);
    }
  } catch (error) {
    console.error("[brevo-webhook] handler failed:", error?.message || error);
  }
});

module.exports = router;

