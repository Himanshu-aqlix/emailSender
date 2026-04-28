const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: "List", required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);
