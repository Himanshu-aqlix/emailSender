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
  res.status(200).json({ success: true });
  const body = req.body;
  setImmediate(() => {
    processBrevoWebhookBody(body).catch((err) => console.error("❌ Brevo webhook async error:", err?.message || err));
  });
});

module.exports = router;
