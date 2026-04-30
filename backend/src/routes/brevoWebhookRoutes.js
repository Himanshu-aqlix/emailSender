const express = require("express");
const { processBrevoWebhookBody } = require("../utils/brevoWebhookHandler");

const router = express.Router();

router.get("/api/webhook/test", (_req, res) => {
  console.log("🔥 TEST HIT");
  res.send("Webhook working");
});

router.get("/webhook/test", (_req, res) => {
  console.log("🔥 TEST WEBHOOK HIT");
  res.send("Webhook OK");
});

router.post("/api/webhook/brevo", (req, res) => {
  const body = req.body;
  const events = Array.isArray(body) ? body : [body];
  console.log(`[webhook] Brevo hit: received ${events.length} event(s)`);
  events.forEach((e, idx) => {
    const eventType = String(e?.event || e?.type || e?.eventType || "unknown").toLowerCase();
    const email = String(e?.email || e?.recipient || "").toLowerCase();
    const tags = Array.isArray(e?.tags) ? e.tags : typeof e?.tags === "string" ? e.tags.split(",") : [];
    const logTag = tags.find((t) => String(t).toLowerCase().startsWith("log:"));
    const campaignTag = tags.find((t) => String(t).toLowerCase().startsWith("campaign:"));
    console.log(
      `[webhook] event ${idx + 1}/${events.length} type=${eventType} email=${email || "n/a"} log=${logTag || "n/a"} campaign=${campaignTag || "n/a"}`
    );
  });

  res.status(200).json({ success: true });
  setImmediate(() => {
    processBrevoWebhookBody(body)
      .then(() => console.log(`[webhook] Brevo batch processed (${events.length} event(s))`))
      .catch((err) => console.error("❌ Brevo webhook async error:", err?.message || err));
  });
});

module.exports = router;
