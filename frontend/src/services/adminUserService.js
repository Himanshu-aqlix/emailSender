import api from "../utils/api";

export const getAdminUsers = () => api.get("/api/admin/users");

export const createAdminUser = (payload) => api.post("/api/admin/users", payload);

export const updateAdminUser = (id, payload) => api.put(`/api/admin/users/${id}`, payload);

export const toggleAdminUserStatus = (id) => api.patch(`/api/admin/users/${id}/status`);
