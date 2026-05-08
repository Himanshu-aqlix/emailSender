const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("email role isActive").lean();
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.isActive === false) return res.status(403).json({ message: "This account has been deactivated" });
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    req.user = {
      id: String(user._id),
      email: String(user.email || "").toLowerCase(),
      role: String(user.role || "user"),
      isActive: user.isActive !== false,
      isAdmin: String(user.role || "user") === "admin" || (adminEmail && String(user.email || "").toLowerCase() === adminEmail),
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};
