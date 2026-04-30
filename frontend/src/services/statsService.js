import api from "../utils/api";

export const getStats = () => api.get("/api/stats");
export const getDashboardStats = () => api.get("/dashboard/stats");
export const getDashboardSummary = () => api.get("/dashboard/summary");
