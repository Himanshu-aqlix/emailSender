import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowUpFromLine,
  ListX,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import {
  bulkContacts,
  createContact,
  deleteContact,
  removeContactFromList,
  updateContact,
} from "../services/contactService";
import { getListById } from "../services/listService";
import { formatCreatedDateTime } from "../utils/formatDateTime";
import { errorToast, messageFromAxios, successToast } from "../utils/toast";

const LIST_CONTACT_MENU_MIN_WIDTH = 236;

export default function ListDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const importFileInputRef = useRef(null);

  const [listName, setListName] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "" });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");

  const [openContactMenuRowId, setOpenContactMenuRowId] = useState(null);
  const [contactMenuCoords, setContactMenuCoords] = useState(null);
  const contactMenuTriggerRef = useRef(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await getListById(id);
      setListName(data?.name || `List ${String(id).slice(-6)}`);
      setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (e) {
      setListName("");
      setContacts([]);
      errorToast(messageFromAxios(e, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    if (!openContactMenuRowId) {
      setContactMenuCoords(null);
      return undefined;
    }
    const layoutMenu = () => {
      const trigger = contactMenuTriggerRef.current;
      if (!trigger?.getBoundingClientRect) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 8;
      let left = rect.right - LIST_CONTACT_MENU_MIN_WIDTH;
      left = Math.max(gutter, Math.min(left, window.innerWidth - LIST_CONTACT_MENU_MIN_WIDTH - gutter));
      let top = rect.bottom + 4;
      const estHeight = 280;
      if (top + estHeight > window.innerHeight - gutter) {
        top = Math.max(gutter, rect.top - estHeight - 4);
      }
      setContactMenuCoords({ top, left });
    };
    layoutMenu();
    window.addEventListener("scroll", layoutMenu, true);
    window.addEventListener("resize", layoutMenu);
    return () => {
      window.removeEventListener("scroll", layoutMenu, true);
      window.removeEventListener("resize", layoutMenu);
    };
  }, [openContactMenuRowId]);

  useEffect(() => {
    if (!openContactMenuRowId) return undefined;
    const onDoc = (e) => {
      if (
        e.target.closest?.("[data-contact-row-actions-root]") ||
        e.target.closest?.("[data-contact-row-dropdown-portal]")
      ) {
        return;
      }
      setOpenContactMenuRowId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openContactMenuRowId]);

  useEffect(() => {
    if (!openContactMenuRowId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpenContactMenuRowId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openContactMenuRowId]);

  useEffect(() => {
    if (showAddModal) setAddError("");
  }, [showAddModal]);

  useEffect(() => {
    if (showImportModal) {
      setImportFile(null);
      setImportError("");
    }
  }, [showImportModal]);

  useEffect(() => {
    if (editTarget) {
      setEditForm({
        name: editTarget.name || "",
        email: editTarget.email || "",
        phone: editTarget.phone || "",
      });
      setEditError("");
    }
  }, [editTarget]);

  const closeContactMenu = () => setOpenContactMenuRowId(null);

  const openEditFromMenu = (c) => {
    closeContactMenu();
    setEditTarget(c);
  };

  const openRemoveFromMenu = (c) => {
    closeContactMenu();
    setRemoveTarget(c);
  };

  const openDeleteFromMenu = (c) => {
    closeContactMenu();
    setDeleteTarget(c);
  };

  const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

  const confirmEditContact = async () => {
    if (!editTarget?._id) return;
    const nameTrim = editForm.name.trim();
    const emailTrim = editForm.email.trim().toLowerCase();
    const phoneTrim = editForm.phone.trim();

    if (!emailTrim || !phoneTrim) {
      setEditError("Email and phone are required.");
      return;
    }
    if (!emailValid(emailTrim)) {
      setEditError("Please enter a valid email address.");
      return;
    }

    setEditSaving(true);
    setEditError("");
    try {
      await updateContact(editTarget._id, {
        name: nameTrim,
        email: emailTrim,
        phone: phoneTrim,
      });
      setEditTarget(null);
      await load();
      window.dispatchEvent(new Event("contacts:refresh"));
      successToast("Contact updated successfully");
    } catch (e) {
      setEditError(messageFromAxios(e, "Something went wrong"));
    } finally {
      setEditSaving(false);
    }
  };

  const confirmRemoveFromList = async () => {
    if (!removeTarget?._id || !id || removeSubmitting) return;
    setRemoveSubmitting(true);
    try {
      await removeContactFromList(id, removeTarget._id);
      successToast("Removed from list");
      setRemoveTarget(null);
      await load();
      window.dispatchEvent(new Event("contacts:refresh"));
      window.dispatchEvent(new Event("lists:refresh"));
    } catch (e) {
      errorToast(messageFromAxios(e, "Something went wrong"));
    } finally {
      setRemoveSubmitting(false);
    }
  };

  const confirmDeleteContact = async () => {
    if (!deleteTarget?._id || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteContact(deleteTarget._id);
      successToast("Contact deleted");
      setDeleteTarget(null);
      await load();
      window.dispatchEvent(new Event("contacts:refresh"));
      window.dispatchEvent(new Event("lists:refresh"));
    } catch (e) {
      errorToast(messageFromAxios(e, "Something went wrong"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const onAddContact = async () => {
    setAddError("");
    const emailTrim = addForm.email.trim();
    const phoneTrim = addForm.phone.trim();
    if (!emailTrim || !phoneTrim || !id) {
      setAddError("Email and phone are required.");
      return;
    }
    setAddSubmitting(true);
    try {
      await createContact({
        name: addForm.name.trim(),
        email: emailTrim,
        phone: phoneTrim,
        listId: id,
      });
      setShowAddModal(false);
      setAddForm({ name: "", email: "", phone: "" });
      await load();
      window.dispatchEvent(new Event("contacts:refresh"));
      window.dispatchEvent(new Event("lists:refresh"));
    } catch (e) {
      setAddError(e?.response?.data?.message || "Failed to add contact");
    } finally {
      setAddSubmitting(false);
    }
  };

  const pickImportFile = () => importFileInputRef.current?.click();

  const onImportConfirm = async () => {
    if (!importFile || !id) return;
    setImportError("");
    setImportSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("listId", id);
      await bulkContacts(fd);
      setShowImportModal(false);
      setImportFile(null);
      await load();
      window.dispatchEvent(new Event("contacts:refresh"));
      window.dispatchEvent(new Event("lists:refresh"));
    } catch (e) {
      setImportError(e?.response?.data?.message || "Import failed");
    } finally {
      setImportSubmitting(false);
    }
  };

  const canSubmitAdd = addForm.email.trim().length > 0 && addForm.phone.trim().length > 0 && !addSubmitting;
  const editCanSave =
    editForm.email.trim() &&
    editForm.phone.trim() &&
    emailValid(editForm.email) &&
    !editSaving;

  const getInitials = (name, email) => {
    const source = String(name || email || "NA").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  };

  const displayContacts = useMemo(() => {
    let rows = [...contacts];
    if (filterBy === "hasPhone") rows = rows.filter((c) => String(c.phone || "").trim().length > 0);
    if (filterBy === "noPhone") rows = rows.filter((c) => String(c.phone || "").trim().length === 0);

    rows.sort((a, b) => {
      if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return rows;
  }, [contacts, filterBy, sortBy]);

  const menuRowContact = useMemo(
    () =>
      openContactMenuRowId
        ? displayContacts.find((c) => String(c._id) === String(openContactMenuRowId)) ?? null
        : null,
    [displayContacts, openContactMenuRowId]
  );

  return (
    <section className="list-detail-page">
      <div className="list-detail-head">
        <div className="list-detail-title-wrap">
          <span className="list-detail-badge">{(listName || "LI").slice(0, 2).toUpperCase()}</span>
          <div>
            <h2 className="dashboard-title">{listName || "List"}</h2>
            <p className="dashboard-subtitle">
              {loading ? "Loading…" : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} in this list · last updated today`}
            </p>
          </div>
        </div>
        <div className="list-detail-actions">
          <button type="button" className="ghost-btn list-detail-btn" onClick={() => navigate("/contacts")}>
            <Users size={14} /> All contacts
          </button>
          <button type="button" className="ghost-btn list-detail-btn" onClick={() => setShowAddModal(true)}>
            <UserRoundPlus size={14} /> Add Contact
          </button>
          <button type="button" className="import-btn list-detail-btn-primary" onClick={() => setShowImportModal(true)}>
            <ArrowUpFromLine size={14} /> Import Excel
          </button>
        </div>
      </div>

      {contacts.length ? (
        <div className="contacts-table-wrap list-detail-table-wrap">
          <div className="list-detail-toolbar">
            <div className="list-detail-toolbar-left">
              <label className="list-detail-control">
                <span>Filter</span>
                <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
                  <option value="all">All contacts</option>
                  <option value="hasPhone">With phone</option>
                  <option value="noPhone">Without phone</option>
                </select>
              </label>
              <label className="list-detail-control">
                <span><ArrowUpDown size={13} /> Sort</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name A-Z</option>
                </select>
              </label>
            </div>
            <span>Showing {displayContacts.length} of {contacts.length}</span>
          </div>
          <table className="contacts-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>PHONE</th>
                <th>LIST</th>
                <th>ADDED</th>
                <th className="list-detail-contact-actions-col-header" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayContacts.map((c, idx) => {
                const menuOpen = openContactMenuRowId === c._id;
                return (
                  <tr key={c._id}>
                    <td className="name-cell">
                      <div className="list-contact-name">
                        <span className="list-contact-avatar">{getInitials(c.name, c.email)}</span>
                        <div>
                          <strong>{c.name || "Unknown"}</strong>
                          <small>Contact #{String(idx + 1).padStart(4, "0")}</small>
                        </div>
                      </div>
                    </td>
                    <td><span className="list-cell-icon"><Mail size={13} /> {c.email}</span></td>
                    <td><span className="list-cell-icon"><Phone size={13} /> {c.phone || "—"}</span></td>
                    <td>
                      <span className="list-pill">{listName}</span>
                    </td>
                    <td className="contacts-added-cell">{formatCreatedDateTime(c.createdAt)}</td>
                    <td className="list-detail-contact-row-actions">
                      <div data-contact-row-actions-root className="contact-row-actions-root">
                        <button
                          type="button"
                          className="contact-row-actions-trigger"
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          aria-label="Contact actions"
                          onClick={(e) => {
                            if (!menuOpen) contactMenuTriggerRef.current = e.currentTarget;
                            setOpenContactMenuRowId(menuOpen ? null : c._id);
                          }}
                        >
                          <MoreVertical size={18} strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {openContactMenuRowId && contactMenuCoords && menuRowContact
        ? createPortal(
            <div
              data-contact-row-dropdown-portal
              className="contact-row-actions-dropdown contact-row-actions-dropdown--portal contact-row-actions-dropdown--elevated"
              role="menu"
              aria-label="Contact actions"
              style={{
                position: "fixed",
                top: contactMenuCoords.top,
                left: contactMenuCoords.left,
                minWidth: LIST_CONTACT_MENU_MIN_WIDTH,
                zIndex: 10060,
              }}
            >
              <div className="contact-row-actions-dropdown__heading">Contact</div>
              <button
                type="button"
                className="contact-row-actions-item"
                role="menuitem"
                onClick={() => openEditFromMenu(menuRowContact)}
              >
                <span className="contact-row-actions-item__icon contact-row-actions-item__icon--primary" aria-hidden>
                  <Pencil size={16} strokeWidth={2} />
                </span>
                <span className="contact-row-actions-item__text">
                  <span className="contact-row-actions-item__title">Edit contact</span>
                  <span className="contact-row-actions-item__hint">Name, email, phone</span>
                </span>
              </button>
              <button
                type="button"
                className="contact-row-actions-item"
                role="menuitem"
                onClick={() => openRemoveFromMenu(menuRowContact)}
              >
                <span className="contact-row-actions-item__icon contact-row-actions-item__icon--neutral" aria-hidden>
                  <ListX size={16} strokeWidth={2} />
                </span>
                <span className="contact-row-actions-item__text">
                  <span className="contact-row-actions-item__title">Remove from list</span>
                  <span className="contact-row-actions-item__hint">Keeps contact in account</span>
                </span>
              </button>
              <div className="contact-row-actions-divider" role="separator" />
              <button
                type="button"
                className="contact-row-actions-item contact-row-actions-item--danger"
                role="menuitem"
                onClick={() => openDeleteFromMenu(menuRowContact)}
              >
                <span className="contact-row-actions-item__icon contact-row-actions-item__icon--danger" aria-hidden>
                  <Trash2 size={16} strokeWidth={2} />
                </span>
                <span className="contact-row-actions-item__text">
                  <span className="contact-row-actions-item__title">Delete contact</span>
                  <span className="contact-row-actions-item__hint">Removes from all lists</span>
                </span>
              </button>
            </div>,
            document.body
          )
        : null}

      {!contacts.length && !loading ? (
        <div className="contacts-empty">
          <div className="contacts-empty-icon">
            <Users size={24} />
          </div>
          <h3>No contacts in this list</h3>
          <p>Add a contact or import a spreadsheet — everything is saved to this list.</p>
          <div className="contacts-empty-actions">
            <button type="button" className="ghost-btn" onClick={() => setShowAddModal(true)}>
              <UserRoundPlus size={14} /> Add Contact
            </button>
            <button type="button" className="import-btn" onClick={() => setShowImportModal(true)}>
              <ArrowUpFromLine size={14} /> Import Excel
            </button>
          </div>
        </div>
      ) : null}

      {editTarget ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !editSaving && setEditTarget(null)}
        >
          <div
            className="contact-modal small import-modal add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-contact-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="edit-contact-title">Edit contact</h3>
                <p id="edit-contact-desc" style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  Lists are unchanged unless you edit them elsewhere.
                </p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !editSaving && setEditTarget(null)}
                aria-label="Close"
                disabled={editSaving}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="edit-contact-name">
                  Name
                </label>
                <input
                  id="edit-contact-name"
                  className="import-modal-input"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Jane Cooper"
                  disabled={editSaving}
                  autoComplete="name"
                  autoFocus
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="edit-contact-email">
                  Email <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="edit-contact-email"
                  className="import-modal-input"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  disabled={editSaving}
                  autoComplete="email"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="edit-contact-phone">
                  Phone <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="edit-contact-phone"
                  className="import-modal-input"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  disabled={editSaving}
                  autoComplete="tel"
                />
              </div>
              {editError ? (
                <p className="import-modal-inline-error" role="alert">
                  {editError}
                </p>
              ) : null}
            </div>
            <div className="import-modal-footer import-modal-footer-stack">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setEditTarget(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary import-modal-btn-primary-wide"
                onClick={confirmEditContact}
                disabled={!editCanSave}
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !removeSubmitting && setRemoveTarget(null)}
        >
          <div
            className="contact-modal small import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-from-list-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="remove-from-list-title">Remove from this list?</h3>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  <strong>{removeTarget.name || removeTarget.email}</strong> stays in your contacts; only the link to
                  {" "}<strong>{listName}</strong> is removed.
                </p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !removeSubmitting && setRemoveTarget(null)}
                aria-label="Close"
                disabled={removeSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setRemoveTarget(null)}
                disabled={removeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-contact-btn-delete"
                onClick={confirmRemoveFromList}
                disabled={removeSubmitting}
              >
                {removeSubmitting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddModal ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !addSubmitting && setShowAddModal(false)}
        >
          <div
            className="contact-modal small import-modal add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="list-add-contact-title"
            aria-describedby="list-add-contact-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="list-add-contact-title">Add a contact</h3>
                <p id="list-add-contact-desc">Saved to &quot;{listName || "this list"}&quot;.</p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !addSubmitting && setShowAddModal(false)}
                aria-label="Close"
                disabled={addSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="list-add-name">
                  Name <span className="import-modal-optional">optional</span>
                </label>
                <input
                  id="list-add-name"
                  className="import-modal-input"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Jane Doe"
                  disabled={addSubmitting}
                  autoComplete="name"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="list-add-email">
                  Email <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="list-add-email"
                  className="import-modal-input"
                  type="email"
                  placeholder="jane@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  disabled={addSubmitting}
                  autoComplete="email"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="list-add-phone">
                  Phone <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="list-add-phone"
                  className="import-modal-input"
                  type="tel"
                  placeholder="+1 555 0100"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  disabled={addSubmitting}
                  autoComplete="tel"
                />
              </div>
              {addError ? (
                <p className="import-modal-inline-error" role="alert">
                  {addError}
                </p>
              ) : null}
            </div>
            <div className="import-modal-footer import-modal-footer-stack">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setShowAddModal(false)}
                disabled={addSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary import-modal-btn-primary-wide"
                onClick={onAddContact}
                disabled={!canSubmitAdd}
              >
                {addSubmitting ? "Adding…" : "Add contact"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !importSubmitting && setShowImportModal(false)}
        >
          <div
            className="contact-modal small import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="list-import-title"
            aria-describedby="list-import-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="list-import-title">Import contacts</h3>
                <p id="list-import-desc">
                  Upload .xlsx, .xls, or .csv with columns <strong>email</strong> (required), optional{" "}
                  <strong>name</strong>, <strong>phone</strong>. Rows import into &quot;{listName || "this list"}&quot;.
                </p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !importSubmitting && setShowImportModal(false)}
                aria-label="Close"
                disabled={importSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="import-modal-field">
                <span className="import-modal-label">File</span>
                <button type="button" className="import-modal-file-trigger" onClick={pickImportFile} disabled={importSubmitting}>
                  <ArrowUpFromLine size={16} strokeWidth={2} aria-hidden />
                  Choose file
                </button>
                {importFile ? (
                  <div className="import-modal-file-row">
                    <span className="import-modal-file-name" title={importFile.name}>
                      {importFile.name}
                    </span>
                    <button
                      type="button"
                      className="import-modal-file-remove"
                      onClick={() => setImportFile(null)}
                      disabled={importSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="import-modal-hint">Requires a header row with an email column.</p>
                )}
              </div>
              {importError ? (
                <p className="import-modal-inline-error" role="alert">
                  {importError}
                </p>
              ) : null}
            </div>
            <div className="import-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setShowImportModal(false)}
                disabled={importSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary"
                onClick={onImportConfirm}
                disabled={!importFile || importSubmitting}
              >
                {importSubmitting ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay delete-modal-overlay" onClick={() => !deleteSubmitting && setDeleteTarget(null)}>
          <div
            className="contact-modal small delete-contact-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="list-delete-contact-title"
            aria-describedby="list-delete-contact-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-contact-header">
              <div className="delete-contact-header-main">
                <span className="delete-contact-icon" aria-hidden="true">
                  <AlertTriangle size={22} strokeWidth={2.25} />
                </span>
                <div className="delete-contact-head-text">
                  <h3 id="list-delete-contact-title">Delete contact</h3>
                  <p id="list-delete-contact-desc">This permanently removes this person from Sendrofy everywhere.</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close delete-contact-close"
                onClick={() => !deleteSubmitting && setDeleteTarget(null)}
                aria-label="Close dialog"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <p className="delete-contact-body">
              Permanently remove <strong>{deleteTarget.name || deleteTarget.email}</strong> from all lists?
            </p>
            <div className="delete-contact-footer">
              <button
                type="button"
                className="delete-contact-btn-cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-contact-btn-delete"
                onClick={confirmDeleteContact}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting…" : "Delete contact"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={importFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setImportFile(f);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </section>
  );
}
