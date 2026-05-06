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

router.all("/api/webhook/brevo", async (req, res) => {
  console.log("🔥 WEBHOOK HIT");
  console.log("METHOD:", req.method);
  console.log("HEADERS:", req.headers);
  console.log("RAW BODY:", req.apiGateway?.event?.body);
  console.log("PARSED BODY:", req.body);
  console.log("QUERY:", req.query);

  res.status(200).send("OK");

  setImmediate(() => {
    try {
      const body = req.body || JSON.parse(req.apiGateway?.event?.body || "{}");
      console.log("✅ FINAL BODY:", body);
      if (req.method === "POST") {
        const events = Array.isArray(body) ? body : [body];
        processBrevoWebhookBody(body)
          .then(() => console.log(`[webhook] Brevo batch processed (${events.length} event(s))`))
          .catch((err) => console.error("❌ Brevo webhook async error:", err?.stack || err));
      } else {
        console.log(`[webhook] Non-POST method ${req.method} received on Brevo webhook route`);
      }
    } catch (e) {
      console.error("❌ BODY PARSE ERROR:", e?.stack || e);
    }
  });
});

module.exports = router;
