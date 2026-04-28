import api from "../utils/api";

export const getStats = () => api.get("/api/stats");
