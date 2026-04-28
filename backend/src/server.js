require("dotenv").config();
const connectDB = require("./config/db");
require("./queues/emailQueue");
const app = require("./app");

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason || "unknown reason");
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error?.stack || error);
});

const start = async () => {
  await connectDB();
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on ${port}`));
};

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
