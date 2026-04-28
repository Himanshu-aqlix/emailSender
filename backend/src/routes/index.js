const express = require("express");
const multer = require("multer");
const { body } = require("express-validator");
const auth = require("../middlewares/auth");
const c = require("../controllers");
const trackingRoutes = require("./trackingRoutes");
const brevoRoutes = require("./brevoRoutes");
const brevoWebhookRoutes = require("./brevoWebhookRoutes");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/api/auth/register", [body("email").isEmail(), body("password").isLength({ min: 6 })], c.register);
router.post("/api/auth/login", [body("email").isEmail(), body("password").isLength({ min: 6 })], c.login);
router.get("/api/auth/me", auth, c.me);
router.post("/api/upload", auth, upload.single("file"), c.uploadExcel);
router.get("/api/contacts", auth, c.getContacts);
router.post("/api/contacts", auth, c.addSingleContact);
router.delete("/api/contacts/:id", auth, c.deleteContact);
router.get("/api/lists", auth, c.getLists);
router.post("/api/lists", auth, c.createList);
router.post("/api/templates", auth, c.createTemplate);
router.get("/api/templates", auth, c.getTemplates);
router.put("/api/templates/:id", auth, c.updateTemplate);
router.delete("/api/templates/:id", auth, c.deleteTemplate);
router.post("/api/campaigns", auth, c.createCampaign);
router.post("/api/campaigns/send", auth, c.sendCampaign);
router.get("/api/campaigns", auth, c.getCampaigns);
router.get("/api/stats", auth, c.getStats);
router.get("/api/logs", auth, c.getLogs);
router.get("/track/open/:id", c.trackOpen);
router.get("/track/click/:id", c.trackClick);
router.use(trackingRoutes);
router.use(brevoRoutes);
router.use(brevoWebhookRoutes);

module.exports = router;
