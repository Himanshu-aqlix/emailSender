import api from "../utils/api";

export const login = (credentials) => api.post("/api/auth/login", credentials);

export const register = (credentials) => api.post("/api/auth/register", credentials);

export const getMe = () => api.get("/api/auth/me");
