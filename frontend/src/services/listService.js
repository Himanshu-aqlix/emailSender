import api from "../utils/api";

export const getLists = () => api.get("/api/lists");

export const getListById = (id, queryString = "") =>
  api.get(`/api/lists/${id}${queryString ? `?${queryString}` : ""}`);

export const createList = (payload) => api.post("/api/lists", payload);
export const deleteList = (id) => api.delete(`/api/lists/${id}`);
export const renameList = (id, name) => api.patch(`/api/lists/${id}`, { name });

export const addContactsToList = (listId, contactIds) =>
  api.put(`/api/lists/${listId}/add-contacts`, { contactIds });
