import api from "../utils/api";

export const getContacts = (queryString = "") =>
  api.get(`/api/contacts${queryString ? `?${queryString}` : ""}`);

export const createContact = (payload) => api.post("/api/contacts", payload);

export const bulkContacts = (formData) => api.post("/api/contacts/bulk", formData);

export const updateContact = (id, payload) => api.put(`/api/contacts/${id}`, payload);

export const deleteContact = (id) => api.delete(`/api/contacts/${id}`);

export const uploadContactsFile = (formData) => api.post("/api/upload", formData);
