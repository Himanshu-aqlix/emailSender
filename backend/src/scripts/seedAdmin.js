require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");

async function seedAdmin() {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL is not set");
  }
  if (!adminPassword || adminPassword.length < 6) {
    throw new Error("ADMIN_PASSWORD must be set and at least 6 characters long");
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const existing = await User.findOne({ email: adminEmail });

  if (existing) {
    existing.password = passwordHash;
    existing.role = "admin";
    existing.isActive = true;
    await existing.save();
    console.log(`[seed-admin] Updated admin user: ${adminEmail}`);
  } else {
    await User.create({
      email: adminEmail,
      password: passwordHash,
      role: "admin",
      isActive: true,
    });
    console.log(`[seed-admin] Created admin user: ${adminEmail}`);
  }
}

seedAdmin()
  .catch((error) => {
    console.error("[seed-admin] Failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      /* ignore close failures */
    }
  });
