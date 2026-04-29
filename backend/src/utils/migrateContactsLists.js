/**
 * One-time style migration: legacy `listId` -> `lists[]`, sync List.contacts, promote phone from fields.
 */
module.exports = async function migrateContactsLists() {
  const Contact = require("../models/Contact");
  const List = require("../models/List");

  try {
    const coll = Contact.collection;
    const legacy = await coll.find({ listId: { $exists: true, $ne: null } }).toArray();
    for (const doc of legacy) {
      const lid = doc.listId;
      const cid = doc._id;
      const phoneFromFields = doc.fields && typeof doc.fields === "object" ? doc.fields.phone : "";
      const phone = doc.phone != null && String(doc.phone).trim() !== "" ? String(doc.phone).trim() : String(phoneFromFields || "").trim();

      await coll.updateOne(
        { _id: cid },
        {
          $addToSet: { lists: lid },
          $set: { phone: phone || "" },
          $unset: { listId: "" },
        }
      );
      await List.collection.updateOne({ _id: lid }, { $addToSet: { contacts: cid } });
    }

    const needsPhone = await coll.find({ $or: [{ phone: { $exists: false } }, { phone: "" }] }).toArray();
    for (const doc of needsPhone) {
      const p = doc.fields && typeof doc.fields === "object" && doc.fields.phone ? String(doc.fields.phone).trim() : "";
      if (p) await coll.updateOne({ _id: doc._id }, { $set: { phone: p } });
    }
  } catch (e) {
    console.warn("[migrate] migrateContactsLists:", e.message || e);
  }
};
