const express = require("express");
const EmailLog = require("../models/EmailLog");
const Campaign = require("../models/Campaign");
const User = require("../models/User");
const { recordTrackingEngagement } = require("../utils/brevoWebhookHandler");

const router = express.Router();
const pixelBuffer = Buffer.from("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const hasOpenedCount = Boolean(Campaign.schema.path("openedCount"));
const hasClickCount = Boolean(Campaign.schema.path("clickCount"));

const safeDecode = (value = "") => {
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
};

const isValidObjectId = (v) => typeof v === "string" && v.length === 24;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());

router.get("/api/track/open/:campaignId/:email", async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId || "");
    const email = safeDecode(req.params.email).toLowerCase();
    const logId = String(req.query.logId || "");
    let log = null;
    if (logId && logId.length === 24) {
      log = await EmailLog.findById(logId).catch(() => null);
    }
    if (!log && campaignId && email) {
      log = await EmailLog.findOne({ campaignId, email }).catch(() => null);
    }
    if (log) {
      await recordTrackingEngagement(log._id, "opened");
      if (hasOpenedCount) {
        await Campaign.updateOne({ _id: campaignId }, { $inc: { openedCount: 1 } }).catch(() => null);
      }
    }
  } catch (error) {
    console.error("[tracking] open failed:", error?.message || error);
  } finally {
    res.set("Content-Type", "image/gif");
    res.send(pixelBuffer);
  }
});

router.get("/api/track/click", async (req, res) => {
  console.log("[tracking] click route hit", {
    path: req.path,
    method: req.method,
    originalUrl: req.originalUrl,
  });
  console.log("[tracking] click full query:", req.query);

  res.on("finish", () => {
    try {
      console.log("[tracking] click response finished", {
        statusCode: res.statusCode,
        headers: typeof res.getHeaders === "function" ? res.getHeaders() : "n/a",
      });
    } catch (e) {
      console.error("[tracking] click finish-log error:", e?.stack || e);
    }
  });

  const campaignId = String(req.query.campaignId || req.query.cid || "");
  const email = safeDecode(req.query.email).toLowerCase().trim();
  const logId = String(req.query.logId || "");
  const fallback = process.env.CLIENT_URL || "http://localhost:5173";
  let redirectUrl = fallback;

  const rawUrl = String(req.query.redirect || req.query.url || "");
  const decodedOnce = safeDecode(rawUrl);
  const decodedTwice = safeDecode(decodedOnce);
  console.log("[tracking] click redirect values", {
    rawRedirect: rawUrl,
    decodedRedirectOnce: decodedOnce,
    decodedRedirectTwice: decodedTwice,
    fallback,
  });
  if (rawUrl) redirectUrl = safeDecode(rawUrl) || fallback;
  console.log("[tracking] click computed redirectUrl", { redirectUrl });

  if (!campaignId || !email || !isValidEmail(email)) {
    console.warn("[tracking] click skipped invalid params", { campaignId, email, logId });
    console.log("[tracking] click redirecting from invalid-params branch", {
      location: redirectUrl || fallback,
      statusBeforeRedirect: res.statusCode,
      headersBeforeRedirect: typeof res.getHeaders === "function" ? res.getHeaders() : "n/a",
    });
    return res.redirect(redirectUrl || fallback);
  }

  try {
    let log = null;
    if (isValidObjectId(logId)) {
      log = await EmailLog.findById(logId).catch(() => null);
    }
    if (!log) {
      log = await EmailLog.findOne({ campaignId, email }).catch(() => null);
    }
    if (log) {
      await recordTrackingEngagement(log._id, "clicked");
    } else {
      console.warn("[tracking] click not matched to EmailLog", { campaignId, email, logId });
    }
    if (log && hasClickCount && campaignId) {
      await Campaign.updateOne({ _id: campaignId }, { $inc: { clickCount: 1 } }).catch(() => null);
    }
  } catch (error) {
    console.error("[tracking] click failed:", error?.message || error);
    console.error("[tracking] click failed stack:", error?.stack || error);
  } finally {
    console.log("[tracking] click about to execute res.redirect()", {
      location: redirectUrl || fallback,
      statusBeforeRedirect: res.statusCode,
      headersBeforeRedirect: typeof res.getHeaders === "function" ? res.getHeaders() : "n/a",
    });
    res.redirect(redirectUrl || fallback);
    console.log("[tracking] click res.redirect() called");
  }
});

router.get("/api/unsubscribe", async (req, res) => {
  const email = decodeURIComponent(String(req.query.email || "")).trim().toLowerCase();
  try {
    if (email) {
      await User.updateOne({ email }, { $set: { unsubscribed: true } }).catch(() => null);
    }
  } catch (error) {
    console.error("[tracking] unsubscribe failed:", error?.message || error);
  }

  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /><title>Unsubscribed</title></head>
      <body style="font-family:Arial,sans-serif;padding:32px;color:#0f172a;">
        <h2 style="margin:0 0 10px;">You have been unsubscribed</h2>
        <p style="margin:0;color:#475569;">You will no longer receive campaign emails from this sender.</p>
      </body>
    </html>
  `);
});

module.exports = router;
