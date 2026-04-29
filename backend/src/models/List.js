const mongoose = require("mongoose");

const ListSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("List", ListSchema);
