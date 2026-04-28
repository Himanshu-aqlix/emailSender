const mongoose = require("mongoose");

const CampaignSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template", required: true },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: "List", required: true },
    status: { type: String, enum: ["draft", "sending", "completed", "failed"], default: "draft" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", CampaignSchema);
