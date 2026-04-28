import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowUpFromLine, Download, FileText, Filter, ListPlus, Trash2, UserRoundPlus, X, Circle, Users } from "lucide-react";
import { createContact, deleteContact, getContacts, uploadContactsFile } from "../services/contactService";
import { createList, getLists } from "../services/listService";

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [query, setQuery] = useState("");
  const [activeList, setActiveList] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addForm, setAddForm] = useState({ name: "", email: "", listId: "", listName: "Newsletter Subscribers" });
  const [importListName, setImportListName] = useState("Newsletter Subscribers");
  const [importSelectedFile, setImportSelectedFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [error, setError] = useState("");
  const [addContactSubmitting, setAddContactSubmitting] = useState(false);
  const importFileInputRef = useRef(null);

  const load = async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (query.trim()) params.set("q", query.trim());
    if (activeList !== "all") params.set("listId", activeList);

    const [contactsRes, listsRes] = await Promise.all([getContacts(params.toString()), getLists()]);
    const data = contactsRes.data || {};
    setContacts(data.items || []);
    setPagination(data.pagination || { page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
    setLists(listsRes.data || []);
  };
  useEffect(() => { load(); }, [page, query, activeList]);
  useEffect(() => {
    if (showImportModal) setImportSelectedFile(null);
  }, [showImportModal]);
  useEffect(() => {
    if (showAddModal) setError("");
  }, [showAddModal]);

  const onFile = async (f) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("listName", importListName.trim() || `Uploaded ${new Date().toLocaleString()}`);
    await uploadContactsFile(fd);
    setPage(1);
    setShowImportModal(false);
    load();
  };

  const openImportModal = () => {
    setImportListName(lists[0]?.name || "Newsletter Subscribers");
    setShowImportModal(true);
  };

  const pickImportFile = () => {
    if (!importListName.trim()) return;
    importFileInputRef.current?.click();
  };

  const handleImportConfirm = async () => {
    if (!importSelectedFile || !importListName.trim()) return;
    setImportSubmitting(true);
    try {
      await onFile(importSelectedFile);
    } finally {
      setImportSubmitting(false);
    }
  };

  const filtered = contacts.filter((c) => (statusFilter === "all" ? true : statusFilter === "subscribed"));

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const listGroups = contacts.reduce((acc, c) => {
    const list = typeof c.listId === "object" ? c.listId : null;
    const id = String(list?._id || c.listId);
    const name = list?.name || `List ${id.slice(-4)}`;
    if (!acc[id]) acc[id] = { count: 0, name };
    acc[id].count += 1;
    return acc;
  }, {});
  const listEntries = Object.entries(listGroups);
  const displayRows = sorted;
  const hasContacts = contacts.length > 0;

  const onAddContact = async () => {
    setError("");
    const emailTrim = addForm.email.trim();
    const listOk = addForm.listId ? true : addForm.listName.trim().length > 0;
    if (!emailTrim || !listOk) return;
    setAddContactSubmitting(true);
    try {
      await createContact({
        name: addForm.name.trim(),
        email: emailTrim,
        listId: addForm.listId || undefined,
        listName: addForm.listId ? undefined : addForm.listName.trim(),
      });
      setShowAddModal(false);
      setAddForm({ name: "", email: "", listId: "", listName: "Newsletter Subscribers" });
      setPage(1);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to add contact");
    } finally {
      setAddContactSubmitting(false);
    }
  };

  const addContactEmailOk = addForm.email.trim().length > 0;
  const addContactListOk = addForm.listId ? true : addForm.listName.trim().length > 0;
  const canSubmitAddContact = addContactEmailOk && addContactListOk && !addContactSubmitting;

  const onCreateList = async () => {
    if (!newListName.trim()) return;
    const { data } = await createList({ name: newListName.trim() });
    setNewListName("");
    setShowListModal(false);
    setAddForm((prev) => ({ ...prev, listId: data._id, listName: data.name }));
    setPage(1);
    await load();
  };

  const onDelete = async () => {
    if (!deleteTarget?._id) return;
    await deleteContact(deleteTarget._id);
    setDeleteTarget(null);
    if (!displayRows.length && page > 1) setPage((p) => p - 1);
    await load();
  };

  const exportCsv = () => {
    const header = ["name", "email", "list", "status", "added"];
    const rows = displayRows.map((c) => [
      c.name || "",
      c.email || "",
      (typeof c.listId === "object" ? c.listId?.name : `List ${String(c.listId || "").slice(-4)}`) || "",
      "subscribed",
      new Date(c.createdAt).toLocaleDateString(),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="contacts-page">
      <div className="contacts-head">
        <div>
          <h2 className="dashboard-title">Contacts</h2>
          <p className="dashboard-subtitle">Manage your audience and lists.</p>
        </div>
        <div className="contacts-actions">
          <button className="ghost-btn" onClick={() => navigate("/templates")}><FileText size={14} /> Template</button>
          <button className="ghost-btn" onClick={exportCsv}><Download size={14} /> Export</button>
          <button className="ghost-btn" onClick={() => setShowAddModal(true)}><UserRoundPlus size={14} /> Add Contact</button>
          <button className="import-btn" onClick={openImportModal}>
            <ArrowUpFromLine size={14} /> Import Excel
          </button>
        </div>
      </div>

      <div className="contacts-tabs">
        <button className={activeList === "all" ? "active" : ""} onClick={() => { setActiveList("all"); setPage(1); }}><Circle size={12} /> All ({pagination.total})</button>
        {listEntries.slice(0, 4).map(([id, v]) => (
          <button key={id} className={activeList === id ? "active" : ""} onClick={() => { setActiveList(id); setPage(1); }}>
            {v.name} ({v.count})
          </button>
        ))}
        <button className="new-list-btn" onClick={() => setShowListModal(true)}><ListPlus size={13} /> New List</button>
      </div>

      {hasContacts ? (
        <div className="contacts-table-wrap">
          <div className="contacts-toolbar">
            <input
              className="contacts-search"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="ghost-btn" onClick={() => setShowFilters((v) => !v)}><Filter size={14} /> Filters</button>
            {showFilters ? (
              <div className="filters-pop">
                <label>Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="subscribed">Subscribed</option>
                </select>
                <label>Sort</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="newest">Newest</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>
            ) : null}
          </div>

          <table className="contacts-table">
            <thead>
              <tr>
                <th></th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>LIST</th>
                <th>STATUS</th>
                <th>ADDED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((c) => (
                <tr key={c._id}>
                  <td><Circle size={14} /></td>
                  <td className="name-cell">{c.name || "Unknown"}</td>
                  <td>{c.email}</td>
                  <td><span className="list-pill">{typeof c.listId === "object" ? c.listId?.name : `List ${String(c.listId || "").slice(-4)}`}</span></td>
                  <td><span className="status-good">subscribed</span></td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td><button className="delete-btn" onClick={() => setDeleteTarget(c)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!displayRows.length ? <div className="empty-row">No contacts found.</div> : null}
          {displayRows.length ? (
            <div className="contacts-pagination">
              <button className="ghost-btn" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button className="ghost-btn" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="contacts-empty">
          <div className="contacts-empty-icon"><Users size={24} /></div>
          <h3>No contacts yet</h3>
          <p>Import an Excel file or add contacts manually to get started.</p>
          <button className="import-btn" onClick={openImportModal}>
            <ArrowUpFromLine size={14} /> Import Excel
          </button>
        </div>
      )}

      {showAddModal ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !addContactSubmitting && setShowAddModal(false)}
        >
          <div
            className="contact-modal small import-modal add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-contact-title"
            aria-describedby="add-contact-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="add-contact-title">Add a Contact</h3>
                <p id="add-contact-desc">Manually add a single contact to a list.</p>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !addContactSubmitting && setShowAddModal(false)}
                aria-label="Close"
                disabled={addContactSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-body">
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="add-contact-name">
                  Name <span className="import-modal-optional">optional</span>
                </label>
                <input
                  id="add-contact-name"
                  className="import-modal-input"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Jane Doe"
                  disabled={addContactSubmitting}
                  autoComplete="name"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="add-contact-email">
                  Email <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="add-contact-email"
                  className="import-modal-input"
                  type="email"
                  placeholder="jane@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  disabled={addContactSubmitting}
                  autoComplete="email"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="add-contact-list">
                  List <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <select
                  id="add-contact-list"
                  className="import-modal-input import-modal-select"
                  value={addForm.listId}
                  onChange={(e) => setAddForm({ ...addForm, listId: e.target.value })}
                  disabled={addContactSubmitting}
                >
                  <option value="">Create / use default list name</option>
                  {lists.map((l) => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </select>
              </div>
              {!addForm.listId ? (
                <div className="import-modal-field">
                  <label className="import-modal-label" htmlFor="add-contact-new-list">
                    New list name <span className="import-modal-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="add-contact-new-list"
                    className="import-modal-input"
                    value={addForm.listName}
                    onChange={(e) => setAddForm({ ...addForm, listName: e.target.value })}
                    placeholder="Newsletter Subscribers"
                    disabled={addContactSubmitting}
                    autoComplete="off"
                  />
                </div>
              ) : null}
              {error ? (
                <p className="import-modal-inline-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="import-modal-footer import-modal-footer-stack">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setShowAddModal(false)}
                disabled={addContactSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary import-modal-btn-primary-wide"
                onClick={onAddContact}
                disabled={!canSubmitAddContact}
              >
                {addContactSubmitting ? "Adding…" : "Add contact"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showListModal ? (
        <div className="modal-overlay" onClick={() => setShowListModal(false)}>
          <div className="contact-modal small" onClick={(e) => e.stopPropagation()}>
            <div className="contact-modal-head">
              <div>
                <h3>New List</h3>
                <p>Create a contact list.</p>
              </div>
              <button className="modal-close" onClick={() => setShowListModal(false)}><X size={16} /></button>
            </div>
            <label>List Name</label>
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Newsletter Subscribers" />
            <div className="contact-modal-actions">
              <button className="import-btn" onClick={onCreateList}>Create List</button>
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
            aria-labelledby="delete-contact-title"
            aria-describedby="delete-contact-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-contact-header">
              <div className="delete-contact-header-main">
                <span className="delete-contact-icon" aria-hidden="true">
                  <AlertTriangle size={22} strokeWidth={2.25} />
                </span>
                <div className="delete-contact-head-text">
                  <h3 id="delete-contact-title">Delete contact</h3>
                  <p id="delete-contact-desc">This removes the contact from all lists in MailPulse and cannot be undone.</p>
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

      {showImportModal ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => !importSubmitting && setShowImportModal(false)}>
          <div
            className="contact-modal small import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
            aria-describedby="import-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="import-modal-title">Import Contacts</h3>
                <p id="import-modal-desc">Enter a list name, choose an Excel file, then import.</p>
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
                <label className="import-modal-label" htmlFor="import-list-input">
                  List name <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="import-list-input"
                  className="import-modal-input"
                  value={importListName}
                  onChange={(e) => setImportListName(e.target.value)}
                  placeholder="Newsletter Subscribers"
                  disabled={importSubmitting}
                  autoComplete="off"
                />
              </div>
              <div className="import-modal-field">
                <span className="import-modal-label">File</span>
                <button
                  type="button"
                  className="import-modal-file-trigger"
                  onClick={pickImportFile}
                  disabled={importSubmitting}
                >
                  <ArrowUpFromLine size={16} strokeWidth={2} aria-hidden />
                  Choose Excel file
                </button>
                {importSelectedFile ? (
                  <div className="import-modal-file-row">
                    <span className="import-modal-file-name" title={importSelectedFile.name}>
                      {importSelectedFile.name}
                    </span>
                    <button
                      type="button"
                      className="import-modal-file-remove"
                      onClick={() => setImportSelectedFile(null)}
                      disabled={importSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="import-modal-hint">Use .xlsx format. Nothing uploaded until you click Import.</p>
                )}
              </div>
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
                onClick={handleImportConfirm}
                disabled={importSubmitting || !importListName.trim() || !importSelectedFile}
              >
                {importSubmitting ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={importFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setImportSelectedFile(f);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </section>
  );
}
