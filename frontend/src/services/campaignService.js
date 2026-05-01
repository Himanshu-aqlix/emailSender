import api from "../utils/api";

/**
 * @param {{ page?: number; limit?: number; q?: string; status?: string }} [params]
 */
export const getCampaigns = (params = {}) => {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.q) searchParams.set("q", params.q);
  if (params.status) searchParams.set("status", params.status);
  const qs = searchParams.toString();
  return api.get(`/api/campaigns${qs ? `?${qs}` : ""}`);
};

export const createCampaign = (data) => api.post("/api/campaigns", data);

export const sendCampaign = (campaignId) => api.post("/api/campaigns/send", { campaignId });

/**
 * @param {string} campaignId
 * @param {{ range?: string }} [opts] range: `1d` | `7d` | `30d` | `1m` (normalized on server)
 */
export const getCampaignDetails = (campaignId, opts = {}) => {
  const sp = new URLSearchParams();
  if (opts.range) sp.set("range", String(opts.range).toLowerCase());
  const q = sp.toString();
  return api.get(`/api/campaigns/${campaignId}/details${q ? `?${q}` : ""}`);
};
export const exportCampaignData = (campaignId) =>
  api.get(`/api/campaign/${campaignId}/export`, { responseType: "blob" });
export const getCampaignRecipientTimeline = (campaignId, email) =>
  api.get(`/api/campaign/${campaignId}/recipient/${encodeURIComponent(email)}/timeline`);
