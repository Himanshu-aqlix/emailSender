/**
 * Local / container HTTP server entry (Mongo + migrations + Bull queue + app.listen).
 * Production Lambda uses lambda.js instead.
 */
require("dotenv").config();
const app = require("./app");
const initApp = require("./init");

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason || "unknown reason");
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error?.stack || error);
});

const start = async () => {
  await initApp();

  try {
    require("./queues/emailQueue");
  } catch (e) {
    console.warn("[runLocal] Email queue unavailable:", e?.message || e);
  }

  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on ${port}`));
};

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
