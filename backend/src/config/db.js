const mongoose = require("mongoose");

/** Reuse socket on Lambda warm invocations (mongoose buffers until connected). */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
};

module.exports = connectDB;
