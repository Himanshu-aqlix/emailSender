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
