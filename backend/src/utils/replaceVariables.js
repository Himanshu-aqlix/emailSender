/**
 * Replace {{token}} placeholders (case-insensitive token names).
 * Missing values become an empty string.
 */
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
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

module.exports = replaceVariables;
