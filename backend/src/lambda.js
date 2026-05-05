const serverless = require("serverless-http");
const app = require("./app");
const initApp = require("./init");

let serverlessHandler;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await initApp();

  if (!serverlessHandler) {
    serverlessHandler = serverless(app, {
      request: (req, event) => {
        // 🔥 Lambda body → Express req.body
        if (event.body) {
          try {
            req.body =
              typeof event.body === "string"
                ? JSON.parse(event.body)
                : event.body;
          } catch (err) {
            console.error("Lambda body parse error:", err);
          }
        }

        // optional: headers/query भी attach कर सकते हो
        req.apiGateway = { event };
      },
    });
  }

  return serverlessHandler(event, context);
};