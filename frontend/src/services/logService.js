import api from "../utils/api";

export const getLogs = () => api.get("/api/logs");
