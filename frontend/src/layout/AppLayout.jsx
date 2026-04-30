import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  LayoutDashboard,
  Users,
  FileText,
  Send,
  BarChart3,
  LogOut,
  X,
  List as ListIcon,
  ChevronDown,
} from "lucide-react";
import { getMe } from "../services/authService";
import { getLists } from "../services/listService";
import { avatarGradientForEmail, formatDisplayName, initialsFromEmail, readStoredUser } from "../utils/userDisplay";

const navAfterLists = [
  { key: "templates", icon: FileText, label: "Templates" },
  { key: "campaigns", icon: Send, label: "Campaigns" },
  { key: "analytics", icon: BarChart3, label: "Analytics" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(readStoredUser);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [listsOpen, setListsOpen] = useState(true);
  const [lists, setLists] = useState([]);

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

  useEffect(() => {
    let cancelled = false;
    getLists()
      .then(({ data }) => {
        if (!cancelled) setLists(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/lists/")) setListsOpen(true);
  }, [location.pathname]);

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
    setShowLogoutConfirm(false);
    navigate("/", { replace: true });
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
          <NavLink to="/dashboard" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}>
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/contacts" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}>
            <Users size={15} />
            <span>Contacts</span>
          </NavLink>

          <div className="app-sidebar-lists">
            <button
              type="button"
              className={`app-nav-link app-sidebar-lists-toggle${listsOpen ? " is-open" : ""}`}
              onClick={() => setListsOpen((o) => !o)}
              aria-expanded={listsOpen}
            >
              <span className="app-sidebar-lists-toggle-label">
                <ListIcon size={15} />
                <span>Lists</span>
              </span>
              <ChevronDown size={14} className="app-sidebar-lists-arrow" aria-hidden />
            </button>
            {listsOpen ? (
              <div className="app-sidebar-lists-sub">
                {lists.length === 0 ? (
                  <span className="app-sidebar-lists-empty">No lists yet</span>
                ) : (
                  lists.map((list) => (
                    <NavLink
                      key={list._id}
                      to={`/lists/${list._id}`}
                      className={({ isActive }) =>
                        `app-sidebar-list-link${isActive ? " active" : ""}`
                      }
                      title={list.name}
                    >
                      {list.name}
                    </NavLink>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {navAfterLists.map((item) => (
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
