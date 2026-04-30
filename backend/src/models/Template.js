const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        path: { type: String, required: true },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Template", TemplateSchema);
