const { BrevoClient } = require("@getbrevo/brevo");

let client = null;

const getSender = () => {
  const from = process.env.MAIL_FROM || "no-reply@example.com";
  const match = from.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  }
  return { email: from.trim() };
};

const getClient = () => {
  if (client) return client;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;
  client = new BrevoClient({ apiKey });
  return client;
};

const sendEmailBrevo = async ({ to, subject, html, tags, headers }) => {
  try {
    const api = getClient();
    if (!api) {
      throw new Error("BREVO_API_KEY is missing");
    }
    if (!process.env.MAIL_FROM || process.env.MAIL_FROM.includes("example.com")) {
      throw new Error("MAIL_FROM must be a verified sender email/domain in Brevo");
    }

    await api.transactionalEmails.sendTransacEmail({
      sender: getSender(),
      to: [{ email: String(to || "").trim() }],
      subject,
      htmlContent: html,
      ...(Array.isArray(tags) && tags.length ? { tags } : {}),
      ...(headers && typeof headers === "object" ? { headers } : {}),
    });
  } catch (error) {
    console.error("[brevo] sendEmailBrevo failed:", error?.message || error);
    throw error;
  }
};

module.exports = { sendEmailBrevo };
