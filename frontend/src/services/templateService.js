import api from "../utils/api";

export const getTemplates = () => api.get("/api/templates");

export const createTemplate = (payload) => api.post("/api/templates", payload);

export const updateTemplate = (id, payload) => api.put(`/api/templates/${id}`, payload);

export const deleteTemplate = (id) => api.delete(`/api/templates/${id}`);
