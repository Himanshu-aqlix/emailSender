import { useEffect, useMemo, useState } from "react";
import { Activity, Pencil, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { getMe } from "../services/authService";
import { createAdminUser, getAdminUsers, updateAdminUser } from "../services/adminUserService";
import { formatCreatedDateTime } from "../utils/formatDateTime";
import { errorToast, messageFromAxios, successToast } from "../utils/toast";
import { readStoredUser } from "../utils/userDisplay";

const EMPTY_FORM = {
  email: "",
  password: "",
  role: "user",
  isActive: true,
};

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export default function AdminUserManagementPage() {
  const [profile, setProfile] = useState(readStoredUser);
  const [profileLoading, setProfileLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ data }) => {
        if (!cancelled) {
          setProfile(data || null);
          if (data) localStorage.setItem("user", JSON.stringify(data));
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data } = await getAdminUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      errorToast(messageFromAxios(error, "Could not load users"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.isAdmin) return;
    loadUsers();
  }, [profile?.isAdmin]);

  const filteredUsers = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const hay = [user.email, user.role].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [search, users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email || "",
      password: "",
      role: user.role || "user",
      isActive: user.isActive !== false,
    });
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const submitForm = async () => {
    const email = String(form.email || "").trim().toLowerCase();
    const password = String(form.password || "");

    if (!email) {
      setFormError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (!editingUser && password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (editingUser?.isSystemAdmin && email !== String(editingUser.email || "").toLowerCase()) {
      setFormError("Configured admin email cannot be changed.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        email,
        role: form.role,
        isActive: form.isActive,
      };
      if (password) payload.password = password;

      if (editingUser?.id) {
        await updateAdminUser(editingUser.id, payload);
        successToast("User updated successfully");
      } else {
        await createAdminUser(payload);
        successToast("User created successfully");
      }
      setShowModal(false);
      setEditingUser(null);
      setForm(EMPTY_FORM);
      setFormError("");
      await loadUsers();
    } catch (error) {
      setFormError(messageFromAxios(error, "Could not save user"));
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading) {
    return <section className="admin-users-page"><div className="panel">Loading user management…</div></section>;
  }

  if (!profile?.isAdmin) {
    return (
      <section className="admin-users-page">
        <div className="admin-users-empty">
          <div className="admin-users-empty-icon"><ShieldCheck size={24} /></div>
          <h2>Admin access required</h2>
          <p>Only users with admin access can view and manage accounts.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-users-page">
      <div className="contacts-head">
        <div>
          <h2 className="dashboard-title">User Management</h2>
          <p className="dashboard-subtitle">
            Create accounts, update roles, and activate or deactivate access without affecting the rest of the app.
          </p>
        </div>
        <button type="button" className="import-btn admin-users-create-btn" onClick={openCreateModal}>
          <UserPlus size={16} /> Create User
        </button>
      </div>

      <div className="admin-users-summary-grid">
        <div className="admin-users-summary-card">
          <div>
            <span>Total users</span>
            <strong>{users.length}</strong>
          </div>
          <span className="admin-users-summary-icon is-users" aria-hidden>
            <Users size={18} />
          </span>
        </div>
        <div className="admin-users-summary-card">
          <div>
            <span>Active users</span>
            <strong>{users.filter((user) => user.isActive !== false).length}</strong>
          </div>
          <span className="admin-users-summary-icon is-active" aria-hidden>
            <Activity size={18} />
          </span>
        </div>
        <div className="admin-users-summary-card">
          <div>
            <span>Admins</span>
            <strong>{users.filter((user) => user.isAdmin).length}</strong>
          </div>
          <span className="admin-users-summary-icon is-admin" aria-hidden>
            <ShieldCheck size={18} />
          </span>
        </div>
      </div>

      <div className="admin-users-panel">
        <div className="admin-users-toolbar">
          <div className="admin-users-toolbar-copy">
            <h3>Team members</h3>
            <p>All users with access to your workspace.</p>
          </div>
          <div className="admin-users-search">
            <Search size={16} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or role"
            />
          </div>
        </div>

        <div className="admin-users-table-wrap">
          <table className="contacts-table admin-users-table">
            <thead>
              <tr>
                <th>EMAIL</th>
                <th>ROLE</th>
                <th>CREATED</th>
                <th>UPDATED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="admin-users-empty-cell">Loading users…</td>
                </tr>
              ) : filteredUsers.length ? (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-users-email-cell">
                        <strong>{user.email}</strong>
                        {user.isSystemAdmin ? <span className="admin-users-system-badge">System admin</span> : null}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-users-role-badge is-${user.role}`}>{user.role}</span>
                    </td>
                    <td>{formatCreatedDateTime(user.createdAt)}</td>
                    <td>{formatCreatedDateTime(user.updatedAt)}</td>
                    <td>
                      <div className="admin-users-actions">
                        <button type="button" className="ghost-btn admin-users-action-btn" onClick={() => openEditModal(user)}>
                          <Pencil size={14} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="admin-users-empty-cell">No users found for the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-users-footnote">
        <span>Showing {filteredUsers.length} of {users.length}</span>
        <span>Updated just now</span>
      </div>

      {showModal ? (
        <div className="modal-overlay import-modal-overlay" onClick={closeModal}>
          <div
            className="contact-modal import-modal admin-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header import-modal-header--professional">
              <div className="import-modal-header-main">
                <div className="import-modal-header-icon contacts-import-modal-icon" aria-hidden>
                  <ShieldCheck size={24} strokeWidth={2} />
                </div>
                <div className="import-modal-header-copy">
                  <p className="import-modal-eyebrow">Admin tools</p>
                  <h3 id="admin-user-modal-title">{editingUser ? "Edit User" : "Create User"}</h3>
                  <p className="import-modal-lede">
                    {editingUser
                      ? "Update account details and role. Leave password blank to keep it unchanged."
                      : "Create a new user account with a starting role."}
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close import-modal-close" onClick={closeModal} aria-label="Close" disabled={saving}>
                <X size={18} />
              </button>
            </div>

            <div className="import-modal-body admin-user-modal-body">
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="admin-user-email">
                  Email <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="admin-user-email"
                  className="import-modal-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={saving || editingUser?.isSystemAdmin}
                  autoFocus
                />
              </div>

              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="admin-user-role">Role</label>
                <select
                  id="admin-user-role"
                  className="import-modal-input"
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  disabled={saving}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="admin-user-password">
                  Password {editingUser ? <span className="import-modal-optional">optional</span> : <span className="import-modal-required" aria-hidden="true">*</span>}
                </label>
                <input
                  id="admin-user-password"
                  className="import-modal-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={saving}
                  placeholder={editingUser ? "Leave blank to keep current password" : "Minimum 6 characters"}
                />
              </div>

              {formError ? <p className="import-modal-inline-error" role="alert">{formError}</p> : null}
            </div>

            <div className="import-modal-footer">
              <button type="button" className="import-modal-btn-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="import-modal-btn-primary import-modal-btn-primary--gradient" onClick={submitForm} disabled={saving}>
                {saving ? "Saving…" : editingUser ? "Save Changes" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
