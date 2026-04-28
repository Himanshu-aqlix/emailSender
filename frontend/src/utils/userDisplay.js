export function formatDisplayName(email) {
  if (!email || typeof email !== "string") return "User";
  const at = email.indexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  const words = local.replace(/[._+\-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function initialsFromEmail(email) {
  const name = formatDisplayName(email);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const single = parts[0] || "";
  if (single.length >= 2) return single.slice(0, 2).toUpperCase();
  if (single.length === 1) return `${single[0]}${single[0]}`.toUpperCase();
  return "?";
}

export function avatarGradientForEmail(email) {
  if (!email) return "linear-gradient(135deg, #dc2626, #991b1b)";
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${h}, 62%, 44%), hsl(${(h + 42) % 360}, 56%, 34%))`;
}

export function readStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (u && typeof u.email === "string") return u;
  } catch {
    /* ignore */
  }
  return null;
}
