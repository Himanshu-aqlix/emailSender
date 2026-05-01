const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true, default: "" },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: "List", index: true }],
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** True when created via POST /api/contacts/sample-data (demo seeding UX). */
    isSampleData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);
