const Bull = require("bull");
const fs = require("fs/promises");
const path = require("path");
const { redisConfig, queueEnabled } = require("../config/redis");
const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");
const Template = require("../models/Template");
const EmailLog = require("../models/EmailLog");
const User = require("../models/User");
const replaceVariables = require("../utils/replaceVariables");
const { sendEmailBrevo } = require("../services/brevoService");
const { sendEmail } = require("../services/emailService");
const { injectTracking } = require("../utils/emailTracking");

let queue = queueEnabled ? new Bull("campaign-queue", { redis: redisConfig }) : null;
let queueFailed = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildEmailAttachments = async (template) => {
  const raw = Array.isArray(template?.attachments) ? template.attachments : [];
  const brevoAttachments = [];
  const smtpAttachments = [];
  for (const item of raw) {
    const diskPath = String(item?.path || "").trim();
    const name = String(item?.name || "attachment").trim() || "attachment";
    if (!diskPath) continue;
    const absolute = path.isAbsolute(diskPath) ? diskPath : path.join(process.cwd(), diskPath);
    try {
      const fileBuffer = await fs.readFile(absolute);
      brevoAttachments.push({ name, content: fileBuffer.toString("base64") });
      smtpAttachments.push({ filename: name, content: fileBuffer });
    } catch (e) {
      console.warn(`[email] attachment skipped (${name}):`, e?.message || e);
    }
  }
  return { brevoAttachments, smtpAttachments };
};

const isBrevoRateLimit = (error) => {
  const status =
    error?.statusCode ||
    error?.status ||
    error?.response?.status ||
    error?.rawResponse?.status;
  return Number(status) === 429;
};

const processCampaign = async (job) => {
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const campaign = await Campaign.findById(job.data.campaignId);
  if (!campaign) return;
  const template = await Template.findById(campaign.templateId);
  const targetListIds = Array.isArray(campaign.listIds) && campaign.listIds.length ? campaign.listIds : [campaign.listId];
  const contacts = await Contact.find({ owner: campaign.owner, lists: { $in: targetListIds } });
  campaign.status = "sending";
  await campaign.save();
  for (const c of contacts) {
    const recipientUser = await User.findOne({ email: c.email.toLowerCase() }).select("unsubscribed").lean().catch(() => null);
    if (recipientUser?.unsubscribed) {
      skippedCount += 1;
      continue;
    }

    const log = await EmailLog.create({ owner: campaign.owner, email: c.email, campaignId: campaign._id });
    try {
      const allowSmtpFallback = process.env.ALLOW_SMTP_FALLBACK !== "false";
      const vars = { name: c.name, email: c.email, phone: c.phone || "", ...c.fields };
      const bodyHtml = replaceVariables(template.html, vars);
      const trackedHtml = injectTracking({ html: bodyHtml, campaignId: campaign._id, email: c.email, logId: log._id });
      const subject = replaceVariables(template.subject, vars);
      const { brevoAttachments, smtpAttachments } = await buildEmailAttachments(template);

      try {
        try {
          await sendEmailBrevo({
            to: c.email,
            subject,
            html: trackedHtml,
            tags: [`campaign:${String(campaign._id)}`, `cid:${String(campaign._id)}`, `log:${String(log._id)}`],
            attachments: brevoAttachments,
          });
        } catch (brevoError) {
          if (isBrevoRateLimit(brevoError)) {
            console.warn(`[email] Brevo rate limited for ${c.email}. Retrying once...`);
            await delay(2500);
            await sendEmailBrevo({
              to: c.email,
              subject,
              html: trackedHtml,
              tags: [`campaign:${String(campaign._id)}`, `cid:${String(campaign._id)}`, `log:${String(log._id)}`],
              attachments: brevoAttachments,
            });
          } else {
            throw brevoError;
          }
        }
      } catch (brevoError) {
        console.error(`[email] Brevo send failed for ${c.email}:`, brevoError?.message || brevoError);
        if (!allowSmtpFallback) {
          throw brevoError;
        }
        await sendEmail({ to: c.email, subject, html: trackedHtml, attachments: smtpAttachments });
        console.warn(`[email] Fallback send succeeded for ${c.email}`);
      }

      log.status = "sent";
      log.sentAt = new Date();
      await log.save();
      sentCount += 1;
    } catch (sendError) {
      console.error(`[email] Send failed for ${c.email}:`, sendError?.message || sendError);
      log.status = "failed";
      await log.save();
      failedCount += 1;
    } finally {
      // Keep Brevo transactional sends under rate limits.
      await delay(450);
    }
  }
  campaign.status = sentCount === 0 && failedCount > 0 ? "failed" : "completed";
  await campaign.save();

  if (sentCount === 0 && failedCount > 0) {
    throw new Error(`All email sends failed (failed=${failedCount}, skipped=${skippedCount}). Check MAIL_FROM/BREVO_API_KEY/SMTP credentials.`);
  }
};

if (queue) {
  queue.on("error", (error) => {
    if (!queueFailed) {
      queueFailed = true;
      console.error("[queue] Redis connection error:", error?.message || error);
      console.warn("[queue] Falling back to direct send mode (queue disabled).");
      queue = null;
      return;
    }
  });
  queue
    .process(3, processCampaign)
    .catch((error) => {
      if (!queueFailed) {
        queueFailed = true;
        console.error("[queue] Worker startup failed:", error?.message || error);
        console.warn("[queue] Falling back to direct send mode (queue disabled).");
        queue = null;
      }
    });
} else {
  console.warn("[queue] Redis queue disabled. Set ENABLE_QUEUE=true to enable Bull/Redis.");
}

const enqueueCampaign = async (campaignId) => {
  if (queue && !queueFailed) {
    await queue.add({ campaignId }, { attempts: 3, backoff: { type: "exponential", delay: 3000 } });
    return { queued: true };
  }
  await processCampaign({ data: { campaignId } });
  return { queued: false };
};

module.exports = { enqueueCampaign };
