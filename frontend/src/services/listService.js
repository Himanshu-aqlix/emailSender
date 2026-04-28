import api from "../utils/api";

export const getLists = () => api.get("/api/lists");

export const createList = (payload) => api.post("/api/lists", payload);
