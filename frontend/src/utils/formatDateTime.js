/** Browser-locale medium date + short time for created timestamps. */
export function formatCreatedDateTime(value) {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return d.toLocaleString();
  }
}
