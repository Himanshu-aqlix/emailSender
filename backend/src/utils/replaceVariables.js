/**
 * Replace {{token}} placeholders (case-insensitive token names).
 * Missing keys become empty strings, except {{name}} which falls back to
 * “Customer” when absent or blank (whitespace-only).
 */
const NAME_FALLBACK = "Customer";

function isBlankName(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function replaceVariables(template, data = {}) {
  const raw = typeof template !== "undefined" && template !== null ? String(template) : "";
  const map = {};
  if (data && typeof data === "object" && !Array.isArray(data)) {
    Object.keys(data).forEach((k) => {
      map[String(k).toLowerCase()] = data[k];
    });
  }

  return raw.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/gi, (_, rawKey) => {
    const key = String(rawKey).toLowerCase();
    const v = map[key];
    if (key === "name") {
      if (isBlankName(v)) return NAME_FALLBACK;
      return String(v).trim();
    }
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

replaceVariables.NAME_FALLBACK = NAME_FALLBACK;
module.exports = replaceVariables;
