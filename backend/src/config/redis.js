const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

const queueEnabled = process.env.ENABLE_QUEUE === "true";

module.exports = { redisConfig, queueEnabled };
