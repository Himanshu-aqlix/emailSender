const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const api = new SibApiV3Sdk.TransactionalEmailsApi();

const sendViaBrevo = async ({ to, subject, html, logId }) => {
  try {
    await api.sendTransacEmail({
      sender: {
        email: process.env.MAIL_FROM,
        name: "MailPulse",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      tags: [`log:${String(logId)}`],
    });

    console.log("✅ Brevo Email Sent:", to);
  } catch (e) {
    console.error("❌ Brevo Send Error:", e?.response?.body || e?.message || e);
  }
};

module.exports = { sendViaBrevo };
