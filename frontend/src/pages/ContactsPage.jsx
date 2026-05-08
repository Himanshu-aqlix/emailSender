import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
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
  getContactOwners,
  getContacts,
  updateContact,
  uploadContactsFile,
} from "../services/contactService";
import { createList, getLists } from "../services/listService";
import { downloadContactSampleFile } from "../utils/downloadContactSampleFile";
import { formatCreatedDateTime } from "../utils/formatDateTime";
import {
  buildContactsQueryParams,
  countActiveFilterKeys,
  DEFAULT_CONTACT_FILTERS,
  getSortLabel,
} from "../utils/contactsFilters";
import { errorToast, messageFromAxios, successToast } from "../utils/toast";
import { formatDisplayName, initialsFromEmail, readStoredUser } from "../utils/userDisplay";
import ContactsFilter from "../components/ContactsFilter";
import { ButtonLoader, TableSkeleton } from "../components/Loaders";

const CONTACTS_MENU_MIN_WIDTH = 220;
const CONTACT_SCOPE_MENU_MIN_WIDTH = 280;
const CONTACT_PAGE_LIMITS = [10, 25, 50, 100];

const buildContactScopeOption = (user, currentUserId) => {
  const id = String(user?.id || user?._id || "");
  const email = String(user?.email || "").trim().toLowerCase();
  const isCurrentUser = !!currentUserId && id === currentUserId;
  return {
    id,
    email,
    scope: isCurrentUser ? "mine" : "user",
    label: isCurrentUser ? "My Contacts" : formatDisplayName(email),
    description: isCurrentUser ? "Only contacts owned by you" : email,
  };
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile] = useState(readStoredUser);
  const currentUserId = String(profile?.id || "");
  const [contactOwners, setContactOwners] = useState([]);
  const [contactVisibility, setContactVisibility] = useState("mine");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [query, setQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...DEFAULT_CONTACT_FILTERS }));
  const [filterDraft, setFilterDraft] = useState(() => ({ ...DEFAULT_CONTACT_FILTERS }));
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
  /** Total contacts for this account (ignores search `q`). Used to distinguish “no data” vs “no search hits”. */
  const [accountContactTotal, setAccountContactTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showContactScopeMenu, setShowContactScopeMenu] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [openContactMenuRowId, setOpenContactMenuRowId] = useState(null);
  const [contactMenuCoords, setContactMenuCoords] = useState(null);
  const contactsMenuTriggerRef = useRef(null);
  const contactScopeTriggerRef = useRef(null);
  const [contactScopeMenuCoords, setContactScopeMenuCoords] = useState(null);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", companyName: "", phone: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", companyName: "", phone: "", listId: "", listName: "", creatingNewList: false });
  const [importListInput, setImportListInput] = useState("");
  const [importListPicked, setImportListPicked] = useState(null);
  const [importSuggestOpen, setImportSuggestOpen] = useState(false);
  const [importSuggestHighlight, setImportSuggestHighlight] = useState(-1);
  const [importModalError, setImportModalError] = useState("");
  const [importSelectedFile, setImportSelectedFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");
  const [addContactSubmitting, setAddContactSubmitting] = useState(false);
  const importFileInputRef = useRef(null);
  const importListSuggestBlurRef = useRef(null);
  const importListSuggestWrapRef = useRef(null);
  const listsRef = useRef([]);
  listsRef.current = lists;
  const bulkUpdateWrapRef = useRef(null);
  const filterWrapRef = useRef(null);
  const contactScopeWrapRef = useRef(null);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkSelectedLists, setBulkSelectedLists] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkToast, setBulkToast] = useState("");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [showSampleTemplateModal, setShowSampleTemplateModal] = useState(false);
  const importWrapToolbarRef = useRef(null);
  const importWrapEmptyRef = useRef(null);
  const importModalOpenRef = useRef(false);

  const filtersSignature = useMemo(
    () =>
      JSON.stringify({
        sort: appliedFilters.sort,
        datePreset: appliedFilters.datePreset,
        customDateFrom: appliedFilters.customDateFrom,
        customDateTo: appliedFilters.customDateTo,
    }),
    [appliedFilters]
  );

  const contactScopeOptions = useMemo(() => {
    const allOption = {
      id: "",
      email: "",
      scope: "all",
      label: "All Contacts",
      description: "See contacts from the shared workspace",
    };
    const mapped = contactOwners
      .map((user) => buildContactScopeOption(user, currentUserId))
      .filter((option) => option.id && option.email);
    const mineOption =
      mapped.find((option) => option.scope === "mine") || {
        id: currentUserId,
        email: String(profile?.email || "").trim().toLowerCase(),
        scope: "mine",
        label: "My Contacts",
        description: "Only contacts owned by you",
      };
    const teammateOptions = mapped
      .filter((option) => option.scope === "user")
      .sort((a, b) => a.label.localeCompare(b.label));
    return [mineOption, allOption, ...teammateOptions];
  }, [contactOwners, currentUserId, profile?.email]);

  const selectedContactScope = useMemo(() => {
    if (contactVisibility === "all") {
      return contactScopeOptions.find((option) => option.scope === "all") || contactScopeOptions[0];
    }
    if (contactVisibility === "user") {
      return (
        contactScopeOptions.find((option) => option.scope === "user" && option.id === selectedOwnerId) ||
        contactScopeOptions[0]
      );
    }
    return contactScopeOptions.find((option) => option.scope === "mine") || contactScopeOptions[0];
  }, [contactScopeOptions, contactVisibility, selectedOwnerId]);

  const dropdownContactScopeOptions = useMemo(
    () => contactScopeOptions.filter((option) => option.scope !== "all"),
    [contactScopeOptions]
  );

  const load = async () => {
    setLoading(true);
    const params = buildContactsQueryParams({
      page,
      limit,
      q: query,
      filters: appliedFilters,
      visibility: contactVisibility,
      ownerId: selectedOwnerId,
    });

    const countParams = new URLSearchParams();
    countParams.set("page", "1");
    countParams.set("limit", "1");
    countParams.set("visibility", "all");

    const promises = [getContacts(params.toString()), getLists(), getContactOwners(), getContacts(countParams.toString())];

    try {
      const results = await Promise.all(promises);
      const contactsRes = results[0];
      const listsRes = results[1];
      const ownersRes = results[2];
      const countRes = results[3];
      const data = contactsRes.data || {};
      setContacts(data.items || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
      setLists(listsRes.data || []);
      setContactOwners(Array.isArray(ownersRes.data) ? ownersRes.data : []);
      const raw = countRes?.data?.pagination?.total;
      setAccountContactTotal(typeof raw === "number" ? raw : 0);
    } catch (e) {
      setContacts([]);
      setPagination({ page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false });
      setLists([]);
      setContactOwners([]);
      setAccountContactTotal(0);
      errorToast(messageFromAxios(e, "Could not load contacts"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [page, limit, query, filtersSignature, contactVisibility, selectedOwnerId]);
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
    importModalOpenRef.current = showImportModal;
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
    if (!showContactScopeMenu) return undefined;
    const onDown = (e) => {
      if (
        contactScopeWrapRef.current?.contains(e.target) ||
        e.target.closest?.("[data-contact-scope-dropdown-portal]")
      ) {
        return;
      }
      setShowContactScopeMenu(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setShowContactScopeMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [showContactScopeMenu]);

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

  useLayoutEffect(() => {
    if (!showContactScopeMenu) {
      setContactScopeMenuCoords(null);
      return undefined;
    }
    const layoutMenu = () => {
      const trigger = contactScopeTriggerRef.current;
      if (!trigger?.getBoundingClientRect) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 10;
      let left = rect.left;
      left = Math.max(gutter, Math.min(left, window.innerWidth - CONTACT_SCOPE_MENU_MIN_WIDTH - gutter));
      let top = rect.bottom + 8;
      const estHeight = 320;
      if (top + estHeight > window.innerHeight - gutter) {
        top = Math.max(gutter, rect.top - estHeight - 8);
      }
      setContactScopeMenuCoords({ top, left });
    };
    layoutMenu();
    window.addEventListener("scroll", layoutMenu, true);
    window.addEventListener("resize", layoutMenu);
    return () => {
      window.removeEventListener("scroll", layoutMenu, true);
      window.removeEventListener("resize", layoutMenu);
    };
  }, [showContactScopeMenu]);

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
        companyName: editTarget.companyName || "",
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

  useEffect(() => {
    setSelectedContactIds([]);
    setShowBulkUpdate(false);
    setBulkSelectedLists([]);
  }, [contactVisibility, selectedOwnerId]);

  useEffect(() => {
    if (contactVisibility !== "user") return;
    if (!selectedOwnerId) {
      setContactVisibility("mine");
      return;
    }
    const hasSelectedOwner = contactScopeOptions.some((option) => option.scope === "user" && option.id === selectedOwnerId);
    if (!hasSelectedOwner) {
      setContactVisibility("mine");
      setSelectedOwnerId("");
    }
  }, [contactScopeOptions, contactVisibility, selectedOwnerId]);

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
    setShowSampleTemplateModal(true);
  };

  const handleDownloadSampleFile = () => {
    downloadContactSampleFile();
    setShowSampleTemplateModal(false);
  };

  const pickImportFile = () => {
    importFileInputRef.current?.click();
  };

  const closeImportModal = () => {
    importModalOpenRef.current = false;
    setShowImportModal(false);
    setImportSuggestOpen(false);
    setImportSuggestHighlight(-1);
    clearImportSuggestBlurTimer();
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
      const { data } = await uploadContactsFile(fd);
      setPage(1);
      setShowImportModal(false);
      await load();
      window.dispatchEvent(new Event("lists:refresh"));
      window.dispatchEvent(new Event("contacts:refresh"));
      setImportSelectedFile(null);
      setImportResult({
        inserted: Number(data?.inserted || data?.imported || 0),
        skippedDuplicates: Number(data?.skippedDuplicates || 0),
        skippedDuplicateEmails: Array.isArray(data?.skippedDuplicateEmails) ? data.skippedDuplicateEmails : [],
      });
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "Import failed.";
      if (importModalOpenRef.current) {
        setImportModalError(message);
      } else {
        errorToast(message);
      }
    } finally {
      setImportSubmitting(false);
    }
  };

  const displayRows = contacts;
  const isOwnedByCurrentUser = useCallback(
    (contact) => String(contact?.owner?._id || contact?.owner?.id || contact?.owner || "") === currentUserId,
    [currentUserId]
  );
  const hasAnyContacts = accountContactTotal > 0;
  const searchTrim = query.trim();
  const hasActiveFiltersApplied = countActiveFilterKeys(appliedFilters) > 0;
  const isSearchWithNoHits = hasAnyContacts && !displayRows.length && searchTrim.length > 0;
  const isFilterEmptyState = hasAnyContacts && !displayRows.length && !searchTrim.length && hasActiveFiltersApplied;
  const selectableDisplayedIds = useMemo(
    () => displayRows.filter((c) => isOwnedByCurrentUser(c)).map((c) => String(c._id)),
    [displayRows, isOwnedByCurrentUser]
  );
  const allDisplayedSelected =
    selectableDisplayedIds.length > 0 && selectableDisplayedIds.every((id) => selectedContactIds.includes(id));

  const activeFilterChips = useMemo(() => {
    const out = [];
    const f = appliedFilters;
    if (f.sort !== "newest") {
      out.push({ key: "sort", kind: "sort", label: getSortLabel(f.sort) });
    }
    if (f.datePreset === "7d") {
      out.push({ key: "date", kind: "date", label: "Last 7 days" });
    } else if (f.datePreset === "30d") {
      out.push({ key: "date", kind: "date", label: "Last 30 days" });
    } else if (f.datePreset === "custom" && (f.customDateFrom || f.customDateTo)) {
      out.push({
        key: "date",
        kind: "date",
        label: `Custom: ${f.customDateFrom || "…"} – ${f.customDateTo || "…"}`,
      });
    }
    return out;
  }, [appliedFilters]);

  const resetAllFilters = () => {
    const next = { ...DEFAULT_CONTACT_FILTERS };
    setFilterDraft(next);
    setAppliedFilters(next);
    setPage(1);
    setShowFilters(false);
  };

  const applyFilterDraft = () => {
    setAppliedFilters({ ...filterDraft });
    setPage(1);
  };

  const removeFilterChip = (chip) => {
    if (chip.kind === "sort") {
      setAppliedFilters((prev) => ({ ...prev, sort: "newest" }));
      setFilterDraft((prev) => ({ ...prev, sort: "newest" }));
    } else if (chip.kind === "date") {
      setAppliedFilters((prev) => ({
        ...prev,
        datePreset: "all",
        customDateFrom: "",
        customDateTo: "",
      }));
      setFilterDraft((prev) => ({
        ...prev,
        datePreset: "all",
        customDateFrom: "",
        customDateTo: "",
      }));
    }
    setPage(1);
  };

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
        companyName: addForm.companyName.trim(),
        email: emailTrim,
        phone: addForm.phone.trim(),
      };
      if (addForm.listId) payload.listId = addForm.listId;
      else if (addForm.creatingNewList && addForm.listName.trim()) {
        payload.listName = addForm.listName.trim();
      }
      await createContact(payload);
      setShowAddModal(false);
      setAddForm({ name: "", email: "", companyName: "", phone: "", listId: "", listName: "", creatingNewList: false });
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
        companyName: editForm.companyName.trim(),
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
    const target = displayRows.find((contact) => String(contact._id) === String(contactId));
    if (!isOwnedByCurrentUser(target)) return;
    setSelectedContactIds((prev) => {
      const id = String(contactId);
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const toggleAllDisplayed = () => {
    setSelectedContactIds((prev) => {
      if (allDisplayedSelected) {
        return prev.filter((id) => !selectableDisplayedIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableDisplayedIds]));
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

  const applyContactScopeOption = (option) => {
    const nextScope = option?.scope || "mine";
    setContactVisibility(nextScope);
    setSelectedOwnerId(nextScope === "user" ? String(option?.id || "") : "");
    setPage(1);
    setShowContactScopeMenu(false);
  };

  const exportCsv = () => {
    const header = ["name", "email", "companyName", "phone", "list", "added"];
    const rows = displayRows.map((c) => [
      c.name || "",
      c.email || "",
      c.companyName || "",
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
                    <FileSpreadsheet size={15} strokeWidth={2} />
                  </span>
                  Download Sample File
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="contacts-scope-row">
        <div className="toolbar-dropdown-anchor contacts-scope-anchor" ref={contactScopeWrapRef}>
          <div className="contacts-scope-controls">
            <button
              type="button"
              className={`ghost-btn contacts-scope-trigger contacts-scope-trigger--all${contactVisibility === "all" ? " is-selected" : ""}`}
              onClick={() =>
                applyContactScopeOption({
                  scope: "all",
                  id: "",
                  label: "All Contacts",
                  description: "See contacts from the shared workspace",
                })
              }
            >
              All Contacts
            </button>
          <button
            ref={contactScopeTriggerRef}
            type="button"
            className={`ghost-btn contacts-scope-trigger contacts-scope-trigger--dropdown${
              contactVisibility !== "all" ? " is-selected" : ""
            }`}
            aria-expanded={showContactScopeMenu}
            aria-haspopup="menu"
            onClick={() => {
              setShowFilters(false);
              setShowBulkUpdate(false);
              setShowContactScopeMenu((prev) => !prev);
            }}
          >
            <Users size={14} aria-hidden />
            {contactVisibility === "all" ? "My Contacts" : selectedContactScope?.label || "My Contacts"}
            <ChevronDown size={14} aria-hidden className={`contacts-scope-trigger-chevron${showContactScopeMenu ? " is-open" : ""}`} />
          </button>
          </div>
          <div className="contacts-scope-meta">
            <strong>Contact scope</strong>
            <span>{selectedContactScope?.description || "Only contacts owned by you"}</span>
          </div>
        </div>
      </div>
      {showContactScopeMenu && contactScopeMenuCoords
        ? createPortal(
            <div
              data-contact-scope-dropdown-portal
              className="contacts-scope-dropdown"
              role="menu"
              aria-label="Contact scope options"
              style={{
                position: "fixed",
                top: contactScopeMenuCoords.top,
                left: contactScopeMenuCoords.left,
                minWidth: CONTACT_SCOPE_MENU_MIN_WIDTH,
                zIndex: 10070,
              }}
            >
              <div className="contacts-scope-dropdown-head">
                <strong>Choose Contact Scope</strong>
                <span>Switch between your contacts and a specific teammate.</span>
              </div>
              <div className="contacts-scope-dropdown-list">
                {dropdownContactScopeOptions.map((option) => {
                  const isSelected =
                    option.scope === contactVisibility &&
                    (option.scope !== "user" || option.id === selectedOwnerId);
                  const avatarText = option.scope === "mine" ? "MC" : initialsFromEmail(option.email || option.label || "");
                  return (
                    <button
                      key={`${option.scope}-${option.id || "all"}`}
                      type="button"
                      className={`contacts-scope-option${isSelected ? " is-selected" : ""}`}
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => applyContactScopeOption(option)}
                    >
                      <span
                        className={`contacts-scope-option-avatar${isSelected ? " is-selected" : ""}`}
                        aria-hidden
                      >
                        {avatarText}
                      </span>
                      <span className="contacts-scope-option-copy">
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </span>
                      {isSelected ? (
                        <span className="contacts-scope-option-check" aria-hidden>
                          <Check size={18} strokeWidth={2.4} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}

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
                  {loading ? (
                    <p className="bulk-update-empty-lists muted"><ButtonLoader label="Loading lists" /></p>
                  ) : !lists.length ? (
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

      {loading ? (
        <div className="contacts-table-wrap">
          <div className="contacts-toolbar">
            <span className="skeleton-line skeleton-line--medium" />
            <span className="skeleton-line skeleton-line--short" />
          </div>
          <TableSkeleton rows={8} columns={8} showAvatar />
        </div>
      ) : hasAnyContacts ? (
        <div className="contacts-table-wrap">
          <div className="contacts-toolbar">
            <input
              className="contacts-search"
              placeholder="Search by name, company, email, or phone"
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
            />
            <div className="toolbar-dropdown-anchor contacts-filter-anchor" ref={filterWrapRef}>
              <button
                type="button"
                className={`ghost-btn contacts-filters-trigger${countActiveFilterKeys(appliedFilters) > 0 ? " has-active-filters" : ""}`}
                onClick={() => {
                  setShowBulkUpdate(false);
                  setShowFilters((v) => {
                    const next = !v;
                    if (next) setFilterDraft({ ...appliedFilters });
                    return next;
                  });
                }}
                aria-expanded={showFilters}
              >
                <Filter size={14} aria-hidden />
                Filters
                {countActiveFilterKeys(appliedFilters) > 0 ? (
                  <span className="contacts-filters-trigger-badge">{countActiveFilterKeys(appliedFilters)}</span>
                ) : null}
              </button>
              <ContactsFilter
                open={showFilters}
                onClose={() => setShowFilters(false)}
                draft={filterDraft}
                onDraftChange={setFilterDraft}
                onApply={applyFilterDraft}
                onReset={resetAllFilters}
              />
            </div>
          </div>

          {activeFilterChips.length > 0 ? (
            <div className="contacts-active-filters" aria-label="Active filters">
              {activeFilterChips.map((chip, idx) => (
                <button
                  key={`${chip.kind}-${chip.listId ?? chip.key}-${idx}`}
                  type="button"
                  className="contacts-filter-chip"
                  onClick={() => removeFilterChip(chip)}
                >
                  <span>{chip.label}</span>
                  <X size={14} strokeWidth={2.25} aria-hidden />
                </button>
              ))}
            </div>
          ) : null}

          <table className="contacts-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allDisplayedSelected}
                    onChange={toggleAllDisplayed}
                    disabled={!selectableDisplayedIds.length}
                    title={selectableDisplayedIds.length ? "Select your contacts on this page" : "No editable contacts in this view"}
                  />
                </th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>COMPANY</th>
                <th>PHONE</th>
                <th>LIST</th>
                <th>ADDED</th>
                <th className="list-detail-contact-actions-col-header" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((c) => {
                const menuOpen = String(openContactMenuRowId) === String(c._id);
                const canManageContact = isOwnedByCurrentUser(c);
                return (
                  <tr key={c._id}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!canManageContact}
                        checked={selectedContactIds.includes(String(c._id))}
                        onChange={() => toggleContactSelection(c._id)}
                        title={canManageContact ? "Select contact" : "Only the owner can update this contact"}
                      />
                    </td>
                    <td className="name-cell">{c.name || "Unknown"}</td>
                    <td>{c.email}</td>
                    <td className="company-cell">
                      <span title={c.companyName || ""}>{c.companyName || "—"}</span>
                    </td>
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
                          disabled={!canManageContact}
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          aria-label={canManageContact ? "Contact actions" : "Read-only contact"}
                          title={canManageContact ? "Manage contact" : "Only the owner can edit or delete this contact"}
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
          {!displayRows.length ? (
            <div
              className={`empty-row${
                isSearchWithNoHits || isFilterEmptyState ? " empty-row--search" : ""
              }`}
            >
              {isSearchWithNoHits ? (
                <>
                  No results for <strong>&quot;{searchTrim}&quot;</strong>. Try a different search or clear the search box.
                </>
              ) : isFilterEmptyState ? (
                <>
                  No contacts match your filters. Try adjusting filters, or use <strong>Reset</strong> in the Filters panel.
                </>
              ) : (
                "No contacts on this page."
              )}
            </div>
          ) : null}
          {displayRows.length ? (
            <div className="contacts-pagination campaign-recipients-pagination">
              <div className="campaign-recipients-pagination-start">
                <label className="campaign-recipients-per-page">
                  <span className="campaign-recipients-per-page-label">Rows per page</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    aria-label="Contacts per page"
                  >
                    {CONTACT_PAGE_LIMITS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="campaign-recipients-page-meta" aria-live="polite">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="campaign-recipients-pagination-end">
                <button
                  type="button"
                  className="campaign-recipients-page-btn"
                  disabled={!pagination.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="campaign-recipients-page-btn"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
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
                      <FileSpreadsheet size={15} strokeWidth={2} />
                    </span>
                    Download Sample File
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
                <label className="import-modal-label" htmlFor="add-contact-company">
                  Company Name <span className="import-modal-optional">optional</span>
                </label>
                <input
                  id="add-contact-company"
                  className="import-modal-input"
                  value={addForm.companyName}
                  onChange={(e) => setAddForm({ ...addForm, companyName: e.target.value })}
                  placeholder="Acme Corp"
                  disabled={addContactSubmitting}
                  autoComplete="organization"
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
                <label className="import-modal-label" htmlFor="contacts-page-edit-company">
                  Company Name <span className="import-modal-optional">optional</span>
                </label>
                <input
                  id="contacts-page-edit-company"
                  className="import-modal-input"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  disabled={editSaving}
                  autoComplete="organization"
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

      {showSampleTemplateModal ? (
        <div
          className="modal-overlay import-modal-overlay"
          onClick={() => setShowSampleTemplateModal(false)}
        >
          <div
            className="contact-modal import-modal sample-data-modal contacts-sample-modal-pro contacts-sample-template-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-data-title"
            aria-describedby="sample-data-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-modal-header import-modal-header--professional">
              <div className="import-modal-header-main">
                <div className="import-modal-header-icon contacts-sample-modal-icon" aria-hidden>
                  <FileSpreadsheet size={24} strokeWidth={2} />
                </div>
                <div className="import-modal-header-copy">
                  <p className="import-modal-eyebrow">Sample template</p>
                  <h3 id="sample-data-title">Download Sample Contact File</h3>
                  <p id="sample-data-desc" className="import-modal-lede">
                    Download a ready-to-use contact import template with the correct column structure. Fill your
                    contact details and upload the file to import contacts easily.
                  </p>
                  <div className="contacts-sample-template-card">
                    <span className="contacts-sample-template-pill">
                      <Download size={14} strokeWidth={2} aria-hidden />
                      Header-only CSV
                    </span>
                    <p className="contacts-sample-template-note">
                      Includes the supported headers: Name, Email, Phone, and Company Name.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close import-modal-close"
                onClick={() => setShowSampleTemplateModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="import-modal-footer sample-data-modal-footer contacts-sample-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={() => setShowSampleTemplateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn-primary import-modal-btn-primary--gradient contacts-sample-template-download"
                onClick={handleDownloadSampleFile}
              >
                <Download size={16} strokeWidth={2} aria-hidden />
                Download Sample File
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div className="modal-overlay import-modal-overlay" onClick={closeImportModal}>
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
                onClick={closeImportModal}
                aria-label="Close"
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
              {importSubmitting ? (
                <p className="import-modal-hint" role="status">
                  Import is running in the background. You can close this window.
                </p>
              ) : null}
            </div>
            <div className="import-modal-footer contacts-import-modal-footer">
              <button
                type="button"
                className="import-modal-btn-secondary"
                onClick={closeImportModal}
              >
                {importSubmitting ? "Close" : "Cancel"}
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

      {importResult ? (
        <div className="modal-overlay import-modal-overlay" onClick={() => setImportResult(null)}>
          <div
            className="contact-modal import-modal import-result-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-import-result-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-result-head">
              <span className="import-result-icon import-result-icon--success" aria-hidden>
                <CheckCircle2 size={24} />
              </span>
              <div>
                <p className="import-modal-eyebrow">Import result</p>
                <h3 id="contacts-import-result-title">Import Completed Successfully</h3>
              </div>
            </div>
            <div className="import-result-summary">
              <div className="import-result-stat import-result-stat--success">
                <CheckCircle2 size={18} aria-hidden />
                <span><strong>{importResult.inserted}</strong> contacts imported</span>
              </div>
              <div className="import-result-stat import-result-stat--warning">
                <AlertTriangle size={18} aria-hidden />
                <span><strong>{importResult.skippedDuplicates}</strong> duplicate contacts skipped</span>
              </div>
            </div>
            {importResult.skippedDuplicateEmails.length ? (
              <div className="import-result-duplicates">
                <strong>Skipped duplicates</strong>
                <ul>
                  {importResult.skippedDuplicateEmails.map((email, index) => (
                    <li key={`${email}-${index}`}>{email}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="import-modal-footer">
              <button type="button" className="import-modal-btn-primary import-modal-btn-primary--gradient" onClick={() => setImportResult(null)}>
                Done
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
