const SibApiV3Sdk = require("sib-api-v3-sdk");

const getBrevoClient = () => {
  const apiKeyValue = process.env.BREVO_API_KEY;
  if (!apiKeyValue) return null;
  const client = SibApiV3Sdk.ApiClient.instance;
  const apiKey = client.authentications["api-key"];
  apiKey.apiKey = apiKeyValue;
  return client;
};

const getEmailEvents = async (opts = {}) => {
  try {
    const client = getBrevoClient();
    if (!client) throw new Error("BREVO_API_KEY is missing");

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const limit = Number(opts.limit || 100);

    const data = await apiInstance.getEmailEventReport({
      limit,
      offset: opts.offset ? Number(opts.offset) : 0,
      startDate: opts.startDate,
      endDate: opts.endDate,
      days: opts.days != null ? Number(opts.days) : undefined,
      email: opts.email,
      event: opts.event,
      tags: opts.tags,
      messageId: opts.messageId,
      templateId: opts.templateId != null ? Number(opts.templateId) : undefined,
      sort: opts.sort || "desc",
    });

    return data;
  } catch (error) {
    console.error("Brevo Fetch Error:", error?.message || error);
    throw error;
  }
};

module.exports = { getEmailEvents };

