const serverless = require("serverless-http");
const app = require("./app");
const initApp = require("./init");

let serverlessHandler;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await initApp();

  if (!serverlessHandler) {
    serverlessHandler = serverless(app, {
      request: (req, event, lambdaContext) => {
        req.apiGateway = { event, context: lambdaContext };

        try {
          if (event?.body) {
            // base64 support (API Gateway sometimes sends this)
            const bodyString = event.isBase64Encoded
              ? Buffer.from(event.body, "base64").toString()
              : event.body;

            req.body =
              typeof bodyString === "string"
                ? JSON.parse(bodyString)
                : bodyString;

            console.log("✅ Parsed Lambda Body:", req.body);
          }
        } catch (err) {
          console.error("❌ Lambda body parse error:", err?.stack || err);
        }
      },
    });
  }

  return serverlessHandler(event, context);
};