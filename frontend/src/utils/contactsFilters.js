/** Default filter state for Contacts table API + UI. */
export const DEFAULT_CONTACT_FILTERS = {
  sort: "newest",
  datePreset: "all",
  customDateFrom: "",
  customDateTo: "",
};

const SORT_LABELS = {
  newest: "Recently added",
  oldest: "Oldest first",
  name_asc: "Name (A → Z)",
  name_desc: "Name (Z → A)",
};

export function getSortLabel(sort) {
  return SORT_LABELS[sort] || sort;
}

/** Build `dateFrom` / `dateTo` ISO query params for the API. */
export function resolveDateRangeForApi(f) {
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

/** Serialize contacts API query including filters. */
export function buildContactsQueryParams({ page, limit, q, filters }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  const qTrim = q != null ? String(q).trim() : "";
  if (qTrim) params.set("q", qTrim);
  params.set("sort", filters.sort || "newest");
  const { dateFrom, dateTo } = resolveDateRangeForApi(filters);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return params;
}

export function countActiveFilterKeys(filters) {
  if (!filters) return 0;
  let n = 0;
  if (filters.sort && filters.sort !== "newest") n += 1;
  if (filters.datePreset && filters.datePreset !== "all") n += 1;
  return n;
}
