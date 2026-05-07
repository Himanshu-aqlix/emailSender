import api from "../utils/api";

export const getLogs = (queryString = "") =>
  api.get(`/api/logs${queryString ? `?${queryString}` : ""}`);
