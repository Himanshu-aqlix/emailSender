const serverless = require("serverless-http");
const app = require("./app");
const initApp = require("./init");

let serverlessHandler;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await initApp();

  if (!serverlessHandler) {
    serverlessHandler = serverless(app);
  }

  return serverlessHandler(event, context);
};
