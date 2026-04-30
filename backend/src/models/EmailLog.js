const mongoose = require("mongoose");

const EmailLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    status: {
      type: String,
      enum: ["sent", "failed", "delivered", "bounced", "clicked", "opened", "complaint", "unsubscribed", "deferred", "error"],
      default: "sent",
    },
    opened: { type: Boolean, default: false },
    clicked: { type: Boolean, default: false },
    openedAt: { type: Date },
    clickedAt: { type: Date },
    sentAt: { type: Date, default: Date.now },
    lastEventAt: { type: Date },
    /** Per-event-type counts from webhooks (dynamic keys). */
    events: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailLog", EmailLogSchema);
