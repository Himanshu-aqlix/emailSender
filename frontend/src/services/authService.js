import api from "../utils/api";

export const login = (credentials) =>
  api.post("/api/auth/login", credentials, {
    headers: {
      "Content-Type": "application/json",
    },
  });

export const register = (credentials) =>
  api.post("/api/auth/register", credentials, {
    headers: {
      "Content-Type": "application/json",
    },
  });

export const getMe = () => api.get("/api/auth/me");
