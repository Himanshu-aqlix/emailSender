const mongoose = require("mongoose");

const EventLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    email: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

EventLogSchema.index({ campaignId: 1, email: 1 });
EventLogSchema.index({ campaignId: 1, eventType: 1 });

module.exports = mongoose.model("EventLog", EventLogSchema);
