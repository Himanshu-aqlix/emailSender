const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");

if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

const sendEmail = async ({ to, subject, html, attachments }) => {
  if (process.env.USE_SENDGRID === "true" && process.env.SENDGRID_API_KEY) {
    await sgMail.send({ to, from: process.env.MAIL_FROM, subject, html, attachments });
    return;
  }
  await smtpTransporter.sendMail({ to, from: process.env.MAIL_FROM, subject, html, attachments });
};

module.exports = { sendEmail };
