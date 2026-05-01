import api from "../utils/api";

export const getContacts = (queryString = "") =>
  api.get(`/api/contacts${queryString ? `?${queryString}` : ""}`);

export const createContact = (payload) => api.post("/api/contacts", payload);

export const postSampleContacts = () => api.post("/api/contacts/sample-data");

export const bulkContacts = (formData) => api.post("/api/contacts/bulk", formData);
export const bulkImportToLists = (formData) => api.post("/api/contacts/bulk-import-to-lists", formData);

export const bulkAssignContactsToLists = (payload) =>
  api.post("/api/contacts/bulk-assign-lists", payload);

export const updateContact = (id, payload) => api.put(`/api/contacts/${id}`, payload);

export const deleteContact = (id) => api.delete(`/api/contacts/${id}`);

export const removeContactFromList = (listId, contactId) =>
  api.delete(`/api/lists/${listId}/contacts/${contactId}`);

export const uploadContactsFile = (formData) => api.post("/api/upload", formData);
