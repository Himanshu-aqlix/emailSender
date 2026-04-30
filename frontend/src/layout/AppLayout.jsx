import { useCallback, useEffect, useMemo, useState } from "react";
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
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { getMe } from "../services/authService";
import { deleteList, getLists, renameList } from "../services/listService";
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
  const [activeListMenuId, setActiveListMenuId] = useState("");
  const [deleteListTarget, setDeleteListTarget] = useState(null);
  const [deleteListSubmitting, setDeleteListSubmitting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [renameListTarget, setRenameListTarget] = useState(null);
  const [renameListName, setRenameListName] = useState("");
  const [renameListSubmitting, setRenameListSubmitting] = useState(false);
  const [renameListError, setRenameListError] = useState("");
  const [toast, setToast] = useState("");

  const refreshLists = useCallback(() => {
    getLists()
      .then(({ data }) => {
        setLists(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setLists([]);
      });
  }, []);

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
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    if (location.pathname.startsWith("/lists/")) setListsOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    const onRefreshLists = () => refreshLists();
    window.addEventListener("lists:refresh", onRefreshLists);
    return () => window.removeEventListener("lists:refresh", onRefreshLists);
  }, [refreshLists]);

  useEffect(() => {
    if (!activeListMenuId) return undefined;
    const onDocClick = () => setActiveListMenuId("");
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [activeListMenuId]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

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

  const deleteNeedsDoubleConfirm = useMemo(
    () => Number(deleteListTarget?.contacts?.length || 0) > 100,
    [deleteListTarget]
  );

  const confirmDeleteList = async () => {
    if (!deleteListTarget?._id) return;
    if (deleteNeedsDoubleConfirm && deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setDeleteListSubmitting(true);
    try {
      await deleteList(deleteListTarget._id);
      setDeleteListTarget(null);
      setDeleteConfirmText("");
      setActiveListMenuId("");
      setToast("List deleted successfully");
      if (location.pathname === `/lists/${deleteListTarget._id}`) navigate("/contacts");
      refreshLists();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
    } finally {
      setDeleteListSubmitting(false);
    }
  };

  const openRenameListModal = (list) => {
    setRenameListTarget(list);
    setRenameListName(list?.name || "");
    setRenameListError("");
    setActiveListMenuId("");
  };

  const confirmRenameList = async () => {
    if (!renameListTarget?._id) return;
    const nextName = String(renameListName || "").trim();
    if (!nextName) {
      setRenameListError("List name is required.");
      return;
    }
    setRenameListSubmitting(true);
    setRenameListError("");
    try {
      await renameList(renameListTarget._id, nextName);
      setRenameListTarget(null);
      setRenameListName("");
      setToast("List renamed successfully");
      refreshLists();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
    } catch (e) {
      setRenameListError(e?.response?.data?.message || "Failed to rename list");
    } finally {
      setRenameListSubmitting(false);
    }
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
                    <div key={list._id} className="app-sidebar-list-row">
                      <NavLink
                        to={`/lists/${list._id}`}
                        className={({ isActive }) =>
                          `app-sidebar-list-link${isActive ? " active" : ""}`
                        }
                        title={list.name}
                      >
                        {list.name}
                      </NavLink>
                      <div className="app-sidebar-list-menu-wrap">
                        <button
                          type="button"
                          className="app-sidebar-list-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveListMenuId((prev) => (prev === String(list._id) ? "" : String(list._id)));
                          }}
                          aria-label={`Open actions for ${list.name}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeListMenuId === String(list._id) ? (
                          <div className="app-sidebar-list-menu open" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="app-sidebar-list-menu-item dropdown-item"
                              onClick={() => openRenameListModal(list)}
                            >
                              <Pencil size={13} className="icon" /> Rename List
                            </button>
                            <button
                              type="button"
                              className="app-sidebar-list-menu-item dropdown-item delete"
                              onClick={() => {
                                setDeleteListTarget(list);
                                setActiveListMenuId("");
                              }}
                            >
                              <Trash2 size={13} className="icon" /> Delete List
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
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

      {deleteListTarget ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => !deleteListSubmitting && setDeleteListTarget(null)}>
          <div
            className="contact-modal small import-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-list-title"
            aria-describedby="delete-list-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="delete-list-title">Delete List</h3>
                <p id="delete-list-desc">
                  Are you sure you want to delete this list? All contacts in this list will be permanently deleted.
                </p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !deleteListSubmitting && setDeleteListTarget(null)}
                aria-label="Close"
                disabled={deleteListSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="review-box">
                <p><strong>List:</strong> {deleteListTarget.name}</p>
                <p><strong>Contacts:</strong> {deleteListTarget?.contacts?.length || 0}</p>
              </div>
              {deleteNeedsDoubleConfirm ? (
                <div className="import-modal-field">
                  <label className="import-modal-label" htmlFor="delete-list-confirm">
                    This list has more than 100 contacts. Type <strong>DELETE</strong> to confirm.
                  </label>
                  <input
                    id="delete-list-confirm"
                    className="import-modal-input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={deleteListSubmitting}
                  />
                </div>
              ) : null}
            </div>
            <div className="import-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setDeleteListTarget(null)}
                disabled={deleteListSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-contact-btn-delete"
                onClick={confirmDeleteList}
                disabled={deleteListSubmitting || (deleteNeedsDoubleConfirm && deleteConfirmText.trim().toUpperCase() !== "DELETE")}
              >
                {deleteListSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {renameListTarget ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => !renameListSubmitting && setRenameListTarget(null)}>
          <div
            className="contact-modal small import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-list-title"
            aria-describedby="rename-list-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="rename-list-title">Rename List</h3>
                <p id="rename-list-desc">Enter a new name for this list.</p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !renameListSubmitting && setRenameListTarget(null)}
                aria-label="Close"
                disabled={renameListSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="rename-list-name">List name</label>
                <input
                  id="rename-list-name"
                  className="import-modal-input"
                  value={renameListName}
                  onChange={(e) => setRenameListName(e.target.value)}
                  disabled={renameListSubmitting}
                  autoFocus
                />
              </div>
              {renameListError ? <p className="auth-error">{renameListError}</p> : null}
            </div>
            <div className="import-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setRenameListTarget(null)}
                disabled={renameListSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary"
                onClick={confirmRenameList}
                disabled={renameListSubmitting || !String(renameListName || "").trim()}
              >
                {renameListSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="global-toast">{toast}</div> : null}
    </div>
  );
}
