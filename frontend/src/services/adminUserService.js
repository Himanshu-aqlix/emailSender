import api from "../utils/api";

export const getAdminUsers = () => api.get("/api/admin/users");

export const createAdminUser = (payload) => api.post("/api/admin/users", payload);

export const updateAdminUser = (id, payload) => api.put(`/api/admin/users/${id}`, payload);

export const deleteAdminUser = (id) => api.delete(`/api/admin/users/${id}`);

export const toggleAdminUserStatus = (id) => api.patch(`/api/admin/users/${id}/status`);
