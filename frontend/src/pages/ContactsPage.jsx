import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpFromLine,
  BarChart3,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Filter,
  MoreVertical,
  Pencil,
  Trash2,
  UserRoundPlus,
  X,
  Users,
} from "lucide-react";
import {
  bulkAssignContactsToLists,
  createContact,
  deleteContact,
  getContacts,
  postSampleContacts,
  updateContact,
  uploadContactsFile,
} from "../services/contactService";
import { createList, getLists } from "../services/listService";
import { formatCreatedDateTime } from "../utils/formatDateTime";
import { errorToast, infoToast, messageFromAxios, successToast } from "../utils/toast";

const CONTACTS_MENU_MIN_WIDTH = 220;

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [openContactMenuRowId, setOpenContactMenuRowId] = useState(null);
  const [contactMenuCoords, setContactMenuCoords] = useState(null);
  const contactsMenuTriggerRef = useRef(null);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", listId: "", listName: "", creatingNewList: false });
  const [importListInput, setImportListInput] = useState("");
  const [importListPicked, setImportListPicked] = useState(null);
  const [importSuggestOpen, setImportSuggestOpen] = useState(false);
  const [importSuggestHighlight, setImportSuggestHighlight] = useState(-1);
  const [importModalError, setImportModalError] = useState("");
  const [importSelectedFile, setImportSelectedFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [addContactSubmitting, setAddContactSubmitting] = useState(false);
  const importFileInputRef = useRef(null);
  const importListSuggestBlurRef = useRef(null);
  const importListSuggestWrapRef = useRef(null);
  const listsRef = useRef([]);
  listsRef.current = lists;
  const bulkUpdateWrapRef = useRef(null);
  const filterWrapRef = useRef(null);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkSelectedLists, setBulkSelectedLists] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkToast, setBulkToast] = useState("");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [showSampleConfirm, setShowSampleConfirm] = useState(false);
  const [sampleSubmitting, setSampleSubmitting] = useState(false);
  const importWrapToolbarRef = useRef(null);
  const importWrapEmptyRef = useRef(null);

  const load = async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (query.trim()) params.set("q", query.trim());

    const [contactsRes, listsRes] = await Promise.all([getContacts(params.toString()), getLists()]);
    const data = contactsRes.data || {};
    setContacts(data.items || []);
    setPagination(data.pagination || { page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
    setLists(listsRes.data || []);
  };
  useEffect(() => { load(); }, [page, query]);
  useEffect(() => {
    const onRefresh = () => {
      setPage(1);
      load();
    };
    window.addEventListener("contacts:refresh", onRefresh);
    return () => window.removeEventListener("contacts:refresh", onRefresh);
  }, []);
  const clearImportSuggestBlurTimer = () => {
    if (importListSuggestBlurRef.current) {
      clearTimeout(importListSuggestBlurRef.current);
      importListSuggestBlurRef.current = null;
    }
  };

  const scheduleImportSuggestClose = () => {
    clearImportSuggestBlurTimer();
    importListSuggestBlurRef.current = setTimeout(() => {
      setImportSuggestOpen(false);
      setImportSuggestHighlight(-1);
      importListSuggestBlurRef.current = null;
    }, 175);
  };

  useEffect(() => {
    if (!showImportModal) return undefined;
    clearImportSuggestBlurTimer();
    setImportModalError("");
    setImportSelectedFile(null);
    setImportListInput("");
    setImportListPicked(null);
    setImportSuggestOpen(false);
    setImportSuggestHighlight(-1);
    return () => clearImportSuggestBlurTimer();
  }, [showImportModal]);

  useEffect(() => {
    if (!importSuggestOpen) return undefined;
    const wrap = importListSuggestWrapRef.current;
    if (!wrap) return undefined;
    const onDocDown = (e) => {
      if (!wrap.contains(e.target)) {
        clearImportSuggestBlurTimer();
        setImportSuggestOpen(false);
        setImportSuggestHighlight(-1);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [importSuggestOpen]);

  const importSearchTrim = importListInput.trim();
  const importFilteredLists = useMemo(() => {
    const q = importSearchTrim.toLowerCase();
    if (!q) return [];
    const current = listsRef.current || [];
    return current.filter((l) => String(l.name || "").toLowerCase().includes(q));
  }, [lists, importSearchTrim]);

  const highlightImportListMatch = useCallback((fullName, query) => {
    const text = String(fullName || "");
    const q = String(query || "").trim();
    if (!q) return text;
    const lowerText = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    const i = lowerText.indexOf(lowerQ);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="import-list-combobox-match">{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  }, []);

  const listStoredContactCount = (list) => (Array.isArray(list?.contacts) ? list.contacts.length : 0);

  const selectImportListSuggestion = (l) => {
    const name = String(l.name || "").trim() || "Untitled";
    setImportListPicked({ id: l._id, name });
    setImportListInput(name);
    setImportSuggestOpen(false);
    setImportSuggestHighlight(-1);
    clearImportSuggestBlurTimer();
  };

  const onImportListSuggestKeyDown = (e) => {
    const n = importFilteredLists.length;
    if (e.key === "Escape") {
      e.preventDefault();
      clearImportSuggestBlurTimer();
      setImportSuggestOpen(false);
      setImportSuggestHighlight(-1);
      return;
    }
    if (!importSuggestOpen || !importSearchTrim) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!n) return;
      setImportSuggestHighlight((h) => (h < 0 ? 0 : (h + 1) % n));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!n) return;
      setImportSuggestHighlight((h) => (h < 0 ? n - 1 : (h - 1 + n) % n));
      return;
    }
    if (e.key === "Enter") {
      if (importSuggestHighlight < 0 || importSuggestHighlight >= n) return;
      e.preventDefault();
      selectImportListSuggestion(importFilteredLists[importSuggestHighlight]);
    }
  };
  useEffect(() => {
    if (showAddModal) setError("");
  }, [showAddModal]);
  useEffect(() => {
    if (!showBulkUpdate) return undefined;
    const onPointerDown = (event) => {
      if (!bulkUpdateWrapRef.current?.contains(event.target)) {
        setShowBulkUpdate(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showBulkUpdate]);
  useEffect(() => {
    if (!showFilters) return undefined;
    const onPointerDown = (event) => {
      if (!filterWrapRef.current?.contains(event.target)) {
        setShowFilters(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showFilters]);

  useEffect(() => {
    if (!importMenuOpen) return undefined;
    const onDown = (e) => {
      if (importWrapToolbarRef.current?.contains(e.target) || importWrapEmptyRef.current?.contains(e.target)) return;
      setImportMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [importMenuOpen]);

  useEffect(() => {
    if (!importMenuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setImportMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importMenuOpen]);

  useEffect(() => {
    if (!bulkToast) return undefined;
    const t = setTimeout(() => setBulkToast(""), 4000);
    return () => clearTimeout(t);
  }, [bulkToast]);

  useLayoutEffect(() => {
    if (!openContactMenuRowId) {
      setContactMenuCoords(null);
      return undefined;
    }
    const layoutMenu = () => {
      const trigger = contactsMenuTriggerRef.current;
      if (!trigger?.getBoundingClientRect) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 8;
      let left = rect.right - CONTACTS_MENU_MIN_WIDTH;
      left = Math.max(gutter, Math.min(left, window.innerWidth - CONTACTS_MENU_MIN_WIDTH - gutter));
      let top = rect.bottom + 4;
      const estHeight = 160;
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
    if (editTarget) {
      setEditForm({
        name: editTarget.name || "",
        email: editTarget.email || "",
        phone: editTarget.phone || "",
      });
      setEditError("");
    }
  }, [editTarget]);

  useEffect(() => {
    if (selectedContactIds.length === 0) {
      setShowBulkUpdate(false);
      setBulkSelectedLists([]);
      setBulkError("");
    }
  }, [selectedContactIds.length]);

  const openImportModal = () => {
    setShowImportModal(true);
  };

  const toggleImportToolbarMenu = () => {
    setImportMenuOpen((prev) => (prev === "toolbar" ? false : "toolbar"));
  };

  const toggleImportEmptyMenu = () => {
    setImportMenuOpen((prev) => (prev === "empty" ? false : "empty"));
  };

  const openImportExcelFromMenu = () => {
    setImportMenuOpen(false);
    openImportModal();
  };

  const openSampleConfirmFromMenu = () => {
    setImportMenuOpen(false);
    setShowSampleConfirm(true);
  };

  const confirmLoadSampleData = async () => {
    if (sampleSubmitting) return;
    setSampleSubmitting(true);
    try {
      const res = await postSampleContacts();
      const payload = res.data || {};
      setShowSampleConfirm(false);
      if (payload.alreadyExists) {
        infoToast(payload.message || "Sample data already added");
      } else {
        successToast(payload.message || "Sample data added successfully");
      }
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
    } catch (e) {
      errorToast(messageFromAxios(e, "Could not load sample data."));
    } finally {
      setSampleSubmitting(false);
    }
  };

  const pickImportFile = () => {
    importFileInputRef.current?.click();
  };

  const handleImportConfirm = async () => {
    if (!importSelectedFile || importSubmitting) return;

    const nameTrim = importListInput.trim();
    let listId = null;
    const pickedMatches =
      importListPicked &&
      String(importListPicked.id) &&
      String(importListPicked.name || "").trim() === nameTrim;

    setImportSubmitting(true);
    setImportModalError("");
    try {
      if (nameTrim) {
        if (pickedMatches) {
          listId = String(importListPicked.id);
        } else {
          const { data } = await createList({ name: nameTrim });
          listId = data?._id ? String(data._id) : null;
        }
        if (!listId) {
          setImportModalError("Could not resolve list for import.");
          return;
        }
      }

      const fd = new FormData();
      fd.append("file", importSelectedFile);
      if (listId) fd.append("listId", listId);
      await uploadContactsFile(fd);
      setPage(1);
      setShowImportModal(false);
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
    } catch (e) {
      setImportModalError(e?.response?.data?.message || e?.message || "Import failed.");
    } finally {
      setImportSubmitting(false);
    }
  };

  const sorted = [...contacts].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const displayRows = sorted;
  const hasContacts = contacts.length > 0;
  const displayedIds = useMemo(() => displayRows.map((c) => String(c._id)), [displayRows]);
  const allDisplayedSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedContactIds.includes(id));

  const onAddContact = async () => {
    setError("");
    const emailTrim = addForm.email.trim();
    const listOk =
      !addForm.creatingNewList || addForm.listName.trim().length > 0;
    if (!emailTrim || !listOk) return;
    setAddContactSubmitting(true);
    try {
      const payload = {
        name: addForm.name.trim(),
        email: emailTrim,
        phone: addForm.phone.trim(),
      };
      if (addForm.listId) payload.listId = addForm.listId;
      else if (addForm.creatingNewList && addForm.listName.trim()) {
        payload.listName = addForm.listName.trim();
      }
      await createContact(payload);
      setShowAddModal(false);
      setAddForm({ name: "", email: "", phone: "", listId: "", listName: "", creatingNewList: false });
      setPage(1);
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to add contact");
    } finally {
      setAddContactSubmitting(false);
    }
  };

  const addContactEmailOk = addForm.email.trim().length > 0;
  const addContactPhoneOk = addForm.phone.trim().length > 0;
  const addContactListOk =
    !addForm.creatingNewList || addForm.listName.trim().length > 0;
  const canSubmitAddContact =
    addContactEmailOk && addContactPhoneOk && addContactListOk && !addContactSubmitting;

  const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

  const closeContactMenu = () => setOpenContactMenuRowId(null);

  const openEditFromMenu = (c) => {
    closeContactMenu();
    setEditTarget(c);
  };

  const openDeleteFromMenu = (c) => {
    closeContactMenu();
    setDeleteTarget(c);
  };

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
      window.dispatchEvent(new Event("lists:refresh"));
      successToast("Contact updated successfully");
    } catch (e) {
      setEditError(messageFromAxios(e, "Something went wrong"));
    } finally {
      setEditSaving(false);
    }
  };

  const editCanSave =
    editForm.email.trim() &&
    editForm.phone.trim() &&
    emailValid(editForm.email) &&
    !editSaving;

  const menuRowContact = useMemo(() => {
    if (!openContactMenuRowId) return null;
    return displayRows.find((c) => String(c._id) === String(openContactMenuRowId)) ?? null;
  }, [displayRows, openContactMenuRowId]);

  const onDelete = async () => {
    if (!deleteTarget?._id || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteContact(deleteTarget._id);
      setDeleteTarget(null);
      if (!displayRows.length && page > 1) setPage((p) => p - 1);
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
      successToast("Contact deleted");
    } catch (e) {
      errorToast(messageFromAxios(e));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((prev) => {
      const id = String(contactId);
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const toggleAllDisplayed = () => {
    setSelectedContactIds((prev) => {
      if (allDisplayedSelected) {
        return prev.filter((id) => !displayedIds.includes(id));
      }
      return Array.from(new Set([...prev, ...displayedIds]));
    });
  };

  const handleBulkAssignToLists = async () => {
    if (!selectedContactIds.length || !bulkSelectedLists.length || bulkSubmitting) return;

    setBulkSubmitting(true);
    setBulkError("");
    setBulkNotice("");
    try {
      const { data } = await bulkAssignContactsToLists({
        contactIds: selectedContactIds,
        listIds: bulkSelectedLists,
      });
      const summary = String(data?.message || "").trim() || "Contacts added to selected lists";
      setBulkToast(summary);
      setShowBulkUpdate(false);
      setBulkSelectedLists([]);
      setSelectedContactIds([]);
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
    } catch (e) {
      setBulkError(e?.response?.data?.message || "Failed to update lists.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const listNamesForCsv = (c) => {
    const refs = Array.isArray(c.lists) ? c.lists : [];
    if (!refs.length) return "";
    return refs
      .map((l) => (typeof l === "object" ? l?.name : ""))
      .filter(Boolean)
      .join("; ");
  };

  const exportCsv = () => {
    const header = ["name", "email", "phone", "list", "added"];
    const rows = displayRows.map((c) => [
      c.name || "",
      c.email || "",
      c.phone || "",
      listNamesForCsv(c),
      formatCreatedDateTime(c.createdAt),
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
          <button className="ghost-btn" onClick={exportCsv}><Download size={14} /> Export</button>
          <button className="ghost-btn" onClick={() => setShowAddModal(true)}><UserRoundPlus size={14} /> Add Contact</button>
          <div className="toolbar-dropdown-anchor contacts-import-anchor contacts-import-anchor--toolbar" ref={importWrapToolbarRef}>
            <button
              type="button"
              className="import-btn import-btn--dropdown-trigger"
              aria-expanded={importMenuOpen === "toolbar"}
              aria-haspopup="menu"
              onClick={toggleImportToolbarMenu}
            >
              Import <ChevronDown size={14} className="import-btn-chevron" strokeWidth={2.25} aria-hidden />
            </button>
            {importMenuOpen === "toolbar" ? (
              <div className="contacts-import-dropdown" role="menu" aria-label="Import options">
                <button type="button" className="contacts-import-dropdown-item" role="menuitem" onClick={openImportExcelFromMenu}>
                  <span aria-hidden className="contacts-import-dropdown-emoji">
                    <FileSpreadsheet size={15} strokeWidth={2} />
                  </span>
                  Import Excel
                </button>
                <button type="button" className="contacts-import-dropdown-item" role="menuitem" onClick={openSampleConfirmFromMenu}>
                  <span aria-hidden className="contacts-import-dropdown-emoji">
                    <BarChart3 size={15} strokeWidth={2} />
                  </span>
                  Use Sample Data
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedContactIds.length ? (
        <div className="contacts-bulk-row">
          <div className="toolbar-dropdown-anchor" ref={bulkUpdateWrapRef}>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setShowFilters(false);
                setShowBulkUpdate((wasOpen) => {
                  const next = !wasOpen;
                  if (next) {
                    setBulkError("");
                    setBulkNotice("");
                    setBulkSelectedLists([]);
                  }
                  return next;
                });
              }}
            >
              Update Contact Lists ({selectedContactIds.length})
            </button>
            {showBulkUpdate ? (
              <div className="filters-pop bulk-update-pop">
                <label>Select Lists</label>
                <p className="bulk-update-sub">Choose one or more lists. Selected contacts are added (not replaced).</p>
                <div className="filters-list-select">
                  {!lists.length ? (
                    <p className="bulk-update-empty-lists muted">No lists yet. Create a list first.</p>
                  ) : (
                    lists.map((l) => {
                      const checked = bulkSelectedLists.includes(String(l._id));
                      return (
                        <label key={l._id} className="filters-list-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const id = String(l._id);
                              setBulkSelectedLists((prev) =>
                                e.target.checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
                              );
                            }}
                          />
                          <span>{l.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  className="import-btn"
                  disabled={
                    bulkSubmitting || !bulkSelectedLists.length || !lists.length
                  }
                  onClick={handleBulkAssignToLists}
                >
                  {bulkSubmitting ? "Applying…" : "Apply to selected lists"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {bulkError ? <p className="auth-error">{bulkError}</p> : null}
      {bulkNotice ? <p className="helper">{bulkNotice}</p> : null}

      {hasContacts ? (
        <div className="contacts-table-wrap">
          <div className="contacts-toolbar">
            <input
              className="contacts-search"
              placeholder="Search by name, email, or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="toolbar-dropdown-anchor" ref={filterWrapRef}>
              <button
                className="ghost-btn"
                onClick={() => {
                  setShowBulkUpdate(false);
                  setShowFilters((v) => !v);
                }}
              >
                <Filter size={14} /> Filters
              </button>
              {showFilters ? (
                <div className="filters-pop filters-dropdown-pop">
                  <label>Sort</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="newest">Newest</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <table className="contacts-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allDisplayedSelected} onChange={toggleAllDisplayed} />
                </th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>PHONE</th>
                <th>LIST</th>
                <th>ADDED</th>
                <th className="list-detail-contact-actions-col-header" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((c) => {
                const menuOpen = String(openContactMenuRowId) === String(c._id);
                return (
                  <tr key={c._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(String(c._id))}
                        onChange={() => toggleContactSelection(c._id)}
                      />
                    </td>
                    <td className="name-cell">{c.name || "Unknown"}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || "—"}</td>
                    <td>
                      <span className="list-pill">
                        {Array.isArray(c.lists) && c.lists.length
                          ? c.lists.map((l) => (typeof l === "object" ? l?.name : "")).filter(Boolean).join(", ") || "—"
                          : "—"}
                      </span>
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
                            if (!menuOpen) contactsMenuTriggerRef.current = e.currentTarget;
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
                    minWidth: CONTACTS_MENU_MIN_WIDTH,
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
          <div className="contacts-empty-actions">
            <div className="toolbar-dropdown-anchor contacts-import-anchor contacts-import-anchor--empty" ref={importWrapEmptyRef}>
              <button
                type="button"
                className="import-btn import-btn--dropdown-trigger"
                aria-expanded={importMenuOpen === "empty"}
                aria-haspopup="menu"
                onClick={toggleImportEmptyMenu}
              >
                Import <ChevronDown size={14} className="import-btn-chevron" strokeWidth={2.25} aria-hidden />
              </button>
              {importMenuOpen === "empty" ? (
                <div className="contacts-import-dropdown" role="menu" aria-label="Import options">
                  <button type="button" className="contacts-import-dropdown-item" role="menuitem" onClick={openImportExcelFromMenu}>
                    <span aria-hidden className="contacts-import-dropdown-emoji">
                      <FileSpreadsheet size={15} strokeWidth={2} />
                    </span>
                    Import Excel
                  </button>
                  <button type="button" className="contacts-import-dropdown-item" role="menuitem" onClick={openSampleConfirmFromMenu}>
                    <span aria-hidden className="contacts-import-dropdown-emoji">
                      <BarChart3 size={15} strokeWidth={2} />
                    </span>
                    Use Sample Data
                  </button>
                </div>
              ) : null}
            </div>
          </div>
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
                <p id="add-contact-desc">
                  Manually add a single contact. List is optional—leave unselected for All contacts only.
                </p>
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
                <label className="import-modal-label" htmlFor="add-contact-phone">
                  Phone <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="add-contact-phone"
                  className="import-modal-input"
                  type="tel"
                  placeholder="+1 555 0100"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  disabled={addContactSubmitting}
                  autoComplete="tel"
                />
              </div>
              <div className="import-modal-field add-contact-list-group">
                <label className="import-modal-label" htmlFor="add-contact-list">
                  List <span className="import-modal-optional">optional</span>
                </label>

                <div className="add-contact-list-row">
                  <select
                    id="add-contact-list"
                    className="import-modal-input import-modal-select"
                    value={addForm.listId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setAddForm((prev) => ({
                        ...prev,
                        listId: nextId,
                        creatingNewList: false,
                      }));
                    }}
                    disabled={addContactSubmitting}
                  >
                    <option value="">No list (All contacts only)</option>
                    {lists.map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="add-contact-create-list"
                    onClick={() =>
                      setAddForm((prev) => ({
                        ...prev,
                        listId: "",
                        creatingNewList: true,
                        listName: "",
                      }))
                    }
                    disabled={addContactSubmitting}
                  >
                    + Create new list
                  </button>
                </div>

                {addForm.creatingNewList ? (
                  <div className="add-contact-new-list">
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
              </div>
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

      {editTarget ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !editSaving && setEditTarget(null)}
        >
          <div
            className="contact-modal small import-modal add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-page-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header">
              <div>
                <h3 id="contacts-page-edit-title">Edit contact</h3>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  Lists stay the same unless you change them elsewhere.
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
                <label className="import-modal-label" htmlFor="contacts-page-edit-name">
                  Name
                </label>
                <input
                  id="contacts-page-edit-name"
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
                <label className="import-modal-label" htmlFor="contacts-page-edit-email">
                  Email <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="contacts-page-edit-email"
                  className="import-modal-input"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  disabled={editSaving}
                  autoComplete="email"
                />
              </div>
              <div className="import-modal-field">
                <label className="import-modal-label" htmlFor="contacts-page-edit-phone">
                  Phone <span className="import-modal-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="contacts-page-edit-phone"
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

      {deleteTarget ? (
        <div className="modal-overlay delete-modal-overlay" onClick={() => !deleteSubmitting && setDeleteTarget(null)}>
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
                  <p id="delete-contact-desc">This removes the contact from all lists in Sendrofy and cannot be undone.</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close delete-contact-close"
                onClick={() => !deleteSubmitting && setDeleteTarget(null)}
                aria-label="Close dialog"
                disabled={deleteSubmitting}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <p className="delete-contact-body">
              Permanently remove <strong>{deleteTarget.name || deleteTarget.email}</strong> from your contacts?
            </p>
            <div className="delete-contact-footer">
              <button type="button" className="delete-contact-btn-cancel" onClick={() => !deleteSubmitting && setDeleteTarget(null)} disabled={deleteSubmitting}>
                Cancel
              </button>
              <button type="button" className="delete-contact-btn-delete" onClick={onDelete} disabled={deleteSubmitting}>
                {deleteSubmitting ? "Deleting…" : "Delete contact"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSampleConfirm ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => !sampleSubmitting && setShowSampleConfirm(false)}
        >
          <div
            className="contact-modal import-modal sample-data-modal contacts-sample-modal-pro"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-data-title"
            aria-describedby="sample-data-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header import-modal-header--professional">
              <div className="import-modal-header-main">
                <div className="import-modal-header-icon contacts-sample-modal-icon" aria-hidden>
                  <BarChart3 size={24} strokeWidth={2} />
                </div>
                <div className="import-modal-header-copy">
                  <p className="import-modal-eyebrow">Preview data</p>
                  <h3 id="sample-data-title">Load sample contacts?</h3>
                  <p id="sample-data-desc" className="import-modal-lede">
                    We’ll add demo contacts so you can try lists, filtering, and campaigns without risking real recipients.
                  </p>
                  <ul className="contacts-sample-modal-points">
                    <li>8 curated contacts with name, email, and phone</li>
                    <li>Random list assignments using your existing lists</li>
                  </ul>
                </div>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => !sampleSubmitting && setShowSampleConfirm(false)}
                aria-label="Close"
                disabled={sampleSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-footer sample-data-modal-footer contacts-sample-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => !sampleSubmitting && setShowSampleConfirm(false)}
                disabled={sampleSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary import-modal-btn-primary--gradient"
                onClick={confirmLoadSampleData}
                disabled={sampleSubmitting}
              >
                {sampleSubmitting ? "Loading…" : "Load sample"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => !importSubmitting && setShowImportModal(false)}>
          <div
            className="contact-modal import-modal contacts-import-modal-pro"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
            aria-describedby="import-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header import-modal-header--professional">
              <div className="import-modal-header-main">
                <div className="import-modal-header-icon contacts-import-modal-icon" aria-hidden>
                  <FileSpreadsheet size={24} strokeWidth={2} />
                </div>
                <div className="import-modal-header-copy">
                  <p className="import-modal-eyebrow">Import from Excel</p>
                  <h3 id="import-modal-title">Import contacts</h3>
                  <p id="import-modal-desc" className="import-modal-lede">
                    Optionally pick or name a list; leave list blank to import into{" "}
                    <strong className="import-modal-strong">All contacts</strong> only (no list). Rows need an{" "}
                    <strong className="import-modal-strong">email</strong> column; name and phone are optional.
                  </p>
                </div>
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
            <div className="import-modal-body contacts-import-modal-body">
              {importModalError ? (
                <p className="import-modal-inline-error import-modal-error-top" role="alert">
                  {importModalError}
                </p>
              ) : null}
              <div className="import-modal-field import-list-combobox-root" ref={importListSuggestWrapRef}>
                <label className="import-modal-label" htmlFor="import-list-input">
                  List name <span className="import-modal-optional">optional</span>
                </label>
                <input
                  id="import-list-input"
                  type="text"
                  className="import-modal-input"
                  value={importListInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setImportListInput(v);
                    setImportListPicked((prev) =>
                      prev && String(prev.name || "").trim() === v.trim() ? prev : null
                    );
                    setImportSuggestHighlight(-1);
                    if (!v.trim()) {
                      setImportSuggestOpen(false);
                      return;
                    }
                    clearImportSuggestBlurTimer();
                    setImportSuggestOpen(true);
                  }}
                  onFocus={() => {
                    clearImportSuggestBlurTimer();
                    if (importListInput.trim()) setImportSuggestOpen(true);
                  }}
                  onBlur={scheduleImportSuggestClose}
                  onKeyDown={onImportListSuggestKeyDown}
                  placeholder="Type to search lists or enter a new name…"
                  disabled={importSubmitting}
                  autoComplete="off"
                />
                {importSuggestOpen && importSearchTrim ? (
                  <ul className="import-list-combobox-dropdown" role="listbox" aria-label="Matching lists">
                    {importFilteredLists.length ? (
                      importFilteredLists.map((l, i) => (
                        <li
                          key={String(l._id)}
                          role="option"
                          className={`import-list-combobox-option${
                            importSuggestHighlight === i ? " active" : ""
                          }`}
                          aria-selected={importSuggestHighlight === i}
                          onMouseEnter={() => setImportSuggestHighlight(i)}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => selectImportListSuggestion(l)}
                        >
                          <span className="import-list-combobox-option-name">
                            {highlightImportListMatch(l.name, importListInput)}
                          </span>
                          <span className="import-list-combobox-option-meta">
                            ({listStoredContactCount(l)}{" "}
                            contact{listStoredContactCount(l) === 1 ? "" : "s"})
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="import-list-suggest-none" role="presentation">
                        No list found — will create new list
                      </li>
                    )}
                  </ul>
                ) : null}
                <p className="import-list-suggest-hint">
                  {importSearchTrim
                    ? importListPicked
                      ? "Existing list selected — contacts append to this list."
                      : "No match picked — Import will create this list name if it doesn’t exist."
                    : "Leave blank — contacts import with no list (visible under All contacts only)."}
                </p>
              </div>
              <div className="import-modal-field">
                <span className="import-modal-label">Spreadsheet file</span>
                <button
                  type="button"
                  className="import-modal-file-trigger contacts-import-file-trigger"
                  onClick={pickImportFile}
                  disabled={importSubmitting}
                >
                  <ArrowUpFromLine size={18} strokeWidth={2} aria-hidden />
                  Choose .xlsx or .xls file
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
                  <p className="import-modal-hint">Accepted: .xlsx, .xls. File is processed only after you confirm.</p>
                )}
              </div>
            </div>
            <div className="import-modal-footer contacts-import-modal-footer">
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
                className="import-modal-btn-primary import-modal-btn-primary--gradient"
                onClick={handleImportConfirm}
                disabled={importSubmitting || !importSelectedFile}
              >
                {importSubmitting ? "Importing…" : "Run import"}
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
      {bulkToast ? <div className="global-toast">{bulkToast}</div> : null}
    </section>
  );
}
