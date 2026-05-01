import { toast as rt } from "react-toastify";

export function successToast(message, options = {}) {
  const msg = String(message ?? "").trim() || "Success";
  rt.success(`✅ ${msg}`, options);
}

export function errorToast(message, options = {}) {
  const msg = String(message ?? "").trim() || "Something went wrong";
  rt.error(`❌ ${msg}`, options);
}

export function infoToast(message, options = {}) {
  const msg = String(message ?? "").trim() || "Notice";
  rt.info(msg, options);
}

export function messageFromAxios(error, fallback = "Something went wrong") {
  const m = error?.response?.data?.message;
  return typeof m === "string" && m.trim() ? m.trim() : fallback;
}
