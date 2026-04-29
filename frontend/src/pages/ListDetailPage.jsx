import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowUpDown, ArrowUpFromLine, Mail, Phone, Trash2, UserRoundPlus, Users, X } from "lucide-react";
import { bulkContacts, createContact, deleteContact } from "../services/contactService";
import { getListById } from "../services/listService";

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await getListById(id);
      setListName(data?.name || `List ${String(id).slice(-6)}`);
      setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch {
      setListName("");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showAddModal) setAddError("");
  }, [showAddModal]);

  useEffect(() => {
    if (showImportModal) {
      setImportFile(null);
      setImportError("");
    }
  }, [showImportModal]);

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
    } catch (e) {
      setImportError(e?.response?.data?.message || "Import failed");
    } finally {
      setImportSubmitting(false);
    }
  };

  const canSubmitAdd = addForm.email.trim().length > 0 && addForm.phone.trim().length > 0 && !addSubmitting;
  const onDelete = async () => {
    if (!deleteTarget?._id) return;
    await deleteContact(deleteTarget._id);
    setDeleteTarget(null);
    await load();
  };

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayContacts.map((c, idx) => {
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
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="delete-btn" onClick={() => setDeleteTarget(c)} aria-label="Delete contact">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
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
        <div className="modal-overlay delete-modal-overlay" onClick={() => setDeleteTarget(null)}>
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
                  <p id="list-delete-contact-desc">This removes the contact from all lists in MailPulse and cannot be undone.</p>
                </div>
              </div>
              <button type="button" className="modal-close delete-contact-close" onClick={() => setDeleteTarget(null)} aria-label="Close dialog">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <p className="delete-contact-body">
              Permanently remove <strong>{deleteTarget.name || deleteTarget.email}</strong> from your contacts?
            </p>
            <div className="delete-contact-footer">
              <button type="button" className="delete-contact-btn-cancel" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="delete-contact-btn-delete" onClick={onDelete}>
                Delete contact
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
