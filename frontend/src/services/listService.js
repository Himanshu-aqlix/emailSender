import api from "../utils/api";

export const getLists = () => api.get("/api/lists");

export const getListById = (id) => api.get(`/api/lists/${id}`);

export const createList = (payload) => api.post("/api/lists", payload);

export const addContactsToList = (listId, contactIds) =>
  api.put(`/api/lists/${listId}/add-contacts`, { contactIds });
