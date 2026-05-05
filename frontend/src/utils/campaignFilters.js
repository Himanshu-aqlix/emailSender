/** Default filter state for Campaigns list API + UI. */
export const DEFAULT_CAMPAIGN_FILTERS = {
  status: null,
  datePreset: "all",
  customDateFrom: "",
  customDateTo: "",
  sort: "newest",
};

const SORT_LABELS = {
  newest: "Newest",
  oldest: "Oldest",
  name_asc: "Name A–Z",
  name_desc: "Name Z–A",
};

export function getCampaignSortLabel(sort) {
  return SORT_LABELS[sort] || sort;
}

export function getStatusChipLabel(status) {
  if (!status) return "";
  const m = { draft: "Draft", sending: "Sending", completed: "Completed" };
  return m[status] || status;
}

export function resolveCampaignDateRangeForApi(f) {
  if (!f || f.datePreset === "all") return { dateFrom: null, dateTo: null };
  const now = new Date();
  if (f.datePreset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
  }
  if (f.datePreset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
  }
  if (f.datePreset === "custom") {
    let dateFrom = null;
    let dateTo = null;
    if (f.customDateFrom) {
      const d = new Date(f.customDateFrom);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        dateFrom = d.toISOString();
      }
    }
    if (f.customDateTo) {
      const d = new Date(f.customDateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        dateTo = d.toISOString();
      }
    }
    return { dateFrom, dateTo };
  }
  return { dateFrom: null, dateTo: null };
}

/** Build GET /api/campaigns query params from UI filters. */
export function buildCampaignsQueryParams({ page, limit, q, filters }) {
  const params = {};
  params.page = page;
  params.limit = limit;
  const qTrim = q != null ? String(q).trim() : "";
  if (qTrim) params.q = qTrim;
  const f = filters || DEFAULT_CAMPAIGN_FILTERS;
  if (f.status && ["draft", "sending", "completed"].includes(f.status)) {
    params.status = f.status;
  }
  const { dateFrom, dateTo } = resolveCampaignDateRangeForApi(f);
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  params.sort = f.sort || "newest";
  return params;
}

export function countActiveCampaignFilterKeys(filters) {
  if (!filters) return 0;
  let n = 0;
  if (filters.status) n += 1;
  if (filters.datePreset && filters.datePreset !== "all") n += 1;
  if (filters.sort && filters.sort !== "newest") n += 1;
  return n;
}

export function getDatePresetChipLabel(preset) {
  if (preset === "7d") return "Last 7 days";
  if (preset === "30d") return "Last 30 days";
  if (preset === "custom") return "Custom range";
  return "";
}

export function isDefaultCampaignFilters(f) {
  const x = f || DEFAULT_CAMPAIGN_FILTERS;
  return (
    !x.status &&
    x.datePreset === "all" &&
    !String(x.customDateFrom || "").trim() &&
    !String(x.customDateTo || "").trim() &&
    (x.sort === "newest" || !x.sort)
  );
}

/**
 * Client-side filter (same rules as API) for tests or optional local use.
 * Prefer server-side filtering via buildCampaignsQueryParams for paginated lists.
 */
export function filterCampaigns(campaigns, filters) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const f = filters || DEFAULT_CAMPAIGN_FILTERS;
  const { dateFrom, dateTo } = resolveCampaignDateRangeForApi(f);
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toMs = dateTo ? new Date(dateTo).getTime() : null;

  let out = list.filter((c) => {
    if (f.status && c.status !== f.status) return false;
    const created = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    if (fromMs != null && created < fromMs) return false;
    if (toMs != null && created > toMs) return false;
    return true;
  });

  if (f.sort === "name_asc") {
    out = [...out].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  } else if (f.sort === "name_desc") {
    out = [...out].sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
  } else if (f.sort === "oldest") {
    out = [...out].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  } else {
    out = [...out].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }
  return out;
}
