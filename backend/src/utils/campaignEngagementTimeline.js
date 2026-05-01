/**
 * Engagement timeline buckets for campaign EventLog aggregates.
 */

const RANGE_MAP = {
  "1d": "1d",
  "24h": "1d",
  "7d": "7d",
  "30d": "30d",
  "1m": "30d",
};

function normalizeRange(q) {
  const key = String(q || "").toLowerCase().trim();
  return RANGE_MAP[key] || "7d";
}

function utcDayKeyParts(d) {
  return {
    y: d.getUTCFullYear(),
    m: String(d.getUTCMonth() + 1).padStart(2, "0"),
    day: String(d.getUTCDate()).padStart(2, "0"),
  };
}

function utcDayStr(d) {
  const { y, m, day } = utcDayKeyParts(d);
  return `${y}-${m}-${day}`;
}

function utcHourBucketStr(d) {
  const { y, m, day } = utcDayKeyParts(d);
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}-${h}`;
}

function buildHourKeysInclusive24() {
  const endHr = new Date();
  endHr.setUTCMinutes(0, 0, 0);
  const keys = [];
  for (let i = 23; i >= 0; i -= 1) {
    const d = new Date(endHr);
    d.setUTCHours(endHr.getUTCHours() - i);
    keys.push(utcHourBucketStr(d));
  }
  return keys;
}

function buildDayKeysInclusive(daysCount) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (daysCount - 1));
  start.setUTCHours(0, 0, 0, 0);

  const keys = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(utcDayStr(new Date(d)));
  }
  return keys;
}

function aggregateTimeWindow(range) {
  const now = new Date();

  if (range === "1d") {
    const tsEnd = now;
    const tsStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { tsStart, tsEnd };
  }

  if (range === "7d") {
    const tsEnd = new Date();
    tsEnd.setUTCHours(23, 59, 59, 999);
    const tsStart = new Date(tsEnd);
    tsStart.setUTCDate(tsStart.getUTCDate() - 6);
    tsStart.setUTCHours(0, 0, 0, 0);
    return { tsStart, tsEnd };
  }

  const tsEnd = new Date();
  tsEnd.setUTCHours(23, 59, 59, 999);
  const tsStart = new Date(tsEnd);
  tsStart.setUTCDate(tsStart.getUTCDate() - 29);
  tsStart.setUTCHours(0, 0, 0, 0);
  return { tsStart, tsEnd };
}

const eventGroupFields = () => ({
  delivered: {
    $sum: { $cond: [{ $eq: ["$eventType", "delivered"] }, 1, 0] },
  },
  opened: {
    $sum: { $cond: [{ $eq: ["$eventType", "opened"] }, 1, 0] },
  },
  clicked: {
    $sum: { $cond: [{ $eq: ["$eventType", "clicked"] }, 1, 0] },
  },
});

/**
 * @param {import("mongoose").Model} EventLog
 * @param {import("mongoose").Types.ObjectId} campaignOid
 * @param {'1d'|'7d'|'30d'} range
 */
async function buildEngagementTimeline(EventLog, campaignOid, range) {
  const { tsStart, tsEnd } = aggregateTimeWindow(range);

  if (range === "1d") {
    const slotKeys = buildHourKeysInclusive24();
    const agg = await EventLog.aggregate([
      {
        $match: {
          campaignId: campaignOid,
          timestamp: { $gte: tsStart, $lte: tsEnd },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d-%H", date: "$timestamp" } },
          ...eventGroupFields(),
        },
      },
    ]);

    const byKey = Object.fromEntries(agg.map((r) => [r._id, r]));
    const timeline = slotKeys.map((key) => {
      const row = byKey[key] || {};
      return {
        bucket: key,
        granularity: "hour",
        delivered: row.delivered || 0,
        opened: row.opened || 0,
        clicked: row.clicked || 0,
      };
    });

    return { timeline, granularity: "hour", range: "1d" };
  }

  if (range === "7d") {
    const slotKeys = buildDayKeysInclusive(7);
    const agg = await EventLog.aggregate([
      {
        $match: {
          campaignId: campaignOid,
          timestamp: { $gte: tsStart, $lte: tsEnd },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          ...eventGroupFields(),
        },
      },
    ]);

    const byKey = Object.fromEntries(agg.map((r) => [r._id, r]));
    const timeline = slotKeys.map((key) => ({
      bucket: key,
      date: key,
      granularity: "day",
      delivered: (byKey[key] || {}).delivered || 0,
      opened: (byKey[key] || {}).opened || 0,
      clicked: (byKey[key] || {}).clicked || 0,
    }));

    return { timeline, granularity: "day", range: "7d" };
  }

  const slotKeys = buildDayKeysInclusive(30);
  const agg = await EventLog.aggregate([
    {
      $match: {
        campaignId: campaignOid,
        timestamp: { $gte: tsStart, $lte: tsEnd },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        ...eventGroupFields(),
      },
    },
  ]);

  const byKey = Object.fromEntries(agg.map((r) => [r._id, r]));

  const dailySorted = slotKeys.map((key) => ({
    bucket: key,
    date: key,
    granularity: "day",
    delivered: (byKey[key] || {}).delivered || 0,
    opened: (byKey[key] || {}).opened || 0,
    clicked: (byKey[key] || {}).clicked || 0,
  }));

  const weeks = [];
  for (let i = 0; i < dailySorted.length; i += 7) {
    const slice = dailySorted.slice(i, i + 7);
    if (!slice.length) continue;
    weeks.push({
      bucket: `${slice[0].bucket}_${slice[slice.length - 1].bucket}`,
      dateStart: slice[0].bucket,
      dateEnd: slice[slice.length - 1].bucket,
      granularity: "week",
      delivered: slice.reduce((s, r) => s + r.delivered, 0),
      opened: slice.reduce((s, r) => s + r.opened, 0),
      clicked: slice.reduce((s, r) => s + r.clicked, 0),
    });
  }

  return { timeline: weeks, granularity: "week", range: "30d" };
}

module.exports = {
  normalizeRange,
  buildEngagementTimeline,
};
