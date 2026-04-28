import api from "../utils/api";

export const getBrevoEvents = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    search.set(k, String(v));
  });
  const qs = search.toString();
  return api.get(`/api/brevo/events${qs ? `?${qs}` : ""}`);
};

