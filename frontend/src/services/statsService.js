import api from "../utils/api";

export const getStats = () => api.get("/api/stats");
export const getDashboardStats = () => api.get("/dashboard/stats");
export const getDashboardSummary = (params = {}) => {
  const r = params.range;
  const q = r != null && r !== "" ? `?range=${encodeURIComponent(r)}` : "";
  return api.get(`/dashboard/summary${q}`);
};
