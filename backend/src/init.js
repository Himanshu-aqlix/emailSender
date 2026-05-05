/**
 * Cold-start initialization for Lambda + local server.
 * Idempotent — safe across warm Lambda invocations.
 *
 * Do not load Bull/email workers here — Lambda disables them; local server loads queues after init.
 */
let isInitialized = false;

module.exports = async function initApp() {
  if (isInitialized) return;

  const connectDB = require("./config/db");
  const migrateContactsLists = require("./utils/migrateContactsLists");

  await connectDB();
  await migrateContactsLists();

  isInitialized = true;
};
