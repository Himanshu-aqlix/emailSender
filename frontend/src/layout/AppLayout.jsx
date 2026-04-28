import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Bell, LayoutDashboard, Users, FileText, Send, BarChart3, LogOut, X } from "lucide-react";
import { getMe } from "../services/authService";
import { avatarGradientForEmail, formatDisplayName, initialsFromEmail, readStoredUser } from "../utils/userDisplay";

const items = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "contacts", icon: Users, label: "Contacts" },
  { key: "templates", icon: FileText, label: "Templates" },
  { key: "campaigns", icon: Send, label: "Campaigns" },
  { key: "analytics", icon: BarChart3, label: "Analytics" },
];

export default function AppLayout() {
  const [profile, setProfile] = useState(readStoredUser);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ data }) => {
        if (cancelled || !data?.email) return;
        setProfile(data);
        localStorage.setItem("user", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const email = profile?.email ?? "";
  const displayName = email ? formatDisplayName(email) : profileLoading ? "Loading…" : "Account";
  const initials = email ? initialsFromEmail(email) : profileLoading ? "…" : "?";

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowLogoutConfirm(false);
    };
    if (showLogoutConfirm) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showLogoutConfirm]);

  const doLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    location.href = "/";
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <img src="/favicon.ico" alt="MailPulse logo" className="app-brand-logo" />
          <div>
            <strong>MailPulse</strong>
            <small>Bulk email suite</small>
          </div>
        </div>

        <nav className="app-nav">
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={`/${item.key}`}
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              <item.icon size={15} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="app-content">
        <header className="app-topbar">
          <div className="app-user">
            <span className="app-bell"><Bell size={14} /></span>
            <div className="app-user-meta">
              <strong title={email || undefined}>{displayName}</strong>
              <small title={email || undefined}>{email || (profileLoading ? "…" : "—")}</small>
            </div>
            <span
              className="app-avatar"
              style={{ background: avatarGradientForEmail(email) }}
              aria-hidden="true"
            >
              {initials}
            </span>
            <button
              className="app-logout"
              onClick={() => {
                setShowLogoutConfirm(true);
              }}
            >
              Logout
            </button>
          </div>
        </header>
        <div className="app-page">
          <Outlet />
        </div>
      </main>

      {showLogoutConfirm ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div
            className="contact-modal small import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
            aria-describedby="logout-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="logout-modal-title">Log out</h3>
                <p id="logout-modal-desc">Are you sure you want to log out of this account?</p>
              </div>
              <button type="button" className="modal-close import-modal-close" onClick={() => setShowLogoutConfirm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body" style={{ gap: 14 }}>
              <div className="review-box" style={{ margin: 0 }}>
                <p style={{ margin: 0, color: "#334155" }}>
                  You’ll need to sign in again to access your dashboard.
                </p>
              </div>
            </div>
            <div className="import-modal-footer import-modal-footer-stack">
              <button type="button" className="import-modal-btn-secondary" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="import-modal-btn-primary" onClick={doLogout}>
                <LogOut size={14} /> Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
