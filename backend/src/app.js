const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const routes = require("./routes");

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    // Allow frontend app (different origin/port) to render uploaded images from /uploads.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.use(morgan("dev"));
app.use((req, _res, next) => {
  console.log("🌐 REQUEST:", req.method, req.url);
  next();
});

const isTrackingPath = (req) =>
  req.path.startsWith("/api/track/") ||
  req.path.startsWith("/track/") ||
  req.path.startsWith("/api/unsubscribe") ||
  req.path.startsWith("/webhook/brevo") ||
  req.path.startsWith("/api/webhook/brevo");

const isAuthLoginPath = (req) =>
  req.path === "/api/auth/login" ||
  req.path === "/auth/login";

const isSafeHighTrafficPath = (req) =>
  req.path === "/api/dashboard/stats" ||
  req.path === "/dashboard/stats" ||
  req.path === "/api/dashboard/summary" ||
  req.path === "/dashboard/summary" ||
  req.path === "/api/campaigns" ||
  req.path === "/api/contacts";

// Tracking endpoints (open pixel + click redirects) can receive bursts from email clients.
// Keep protection, but allow higher volume to avoid false 429s.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isTrackingPath(req),
  })
);

// Default API rate limit (exclude tracking endpoints handled above).
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isTrackingPath(req) || isAuthLoginPath(req) || isSafeHighTrafficPath(req),
  })
);

// Strict limiter for login brute-force protection.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isAuthLoginPath(req),
  })
);
app.use(routes);
app.get("/health", (_req, res) => res.json({ ok: true }));

module.exports = app;
