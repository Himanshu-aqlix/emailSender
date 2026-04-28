const express = require("express");
const auth = require("../middlewares/auth");
const { getEmailEvents } = require("../services/brevoTrackingService");

const router = express.Router();

router.get("/api/brevo/events", auth, async (req, res) => {
  try {
    const data = await getEmailEvents({
      limit: req.query.limit,
      offset: req.query.offset,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      days: req.query.days,
      email: req.query.email,
      event: req.query.event,
      tags: req.query.tags,
      messageId: req.query.messageId,
      templateId: req.query.templateId,
      sort: req.query.sort,
    });
    res.json(data);
  } catch {
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

module.exports = router;

