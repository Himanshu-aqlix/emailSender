import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Eye, Filter, Plus, Send, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createCampaign, getCampaigns, sendCampaign } from "../services/campaignService";
import { getContacts } from "../services/contactService";
import { getLists } from "../services/listService";
import { getTemplates } from "../services/templateService";

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.contacts)) return value.contacts;
  if (Array.isArray(value?.lists)) return value.lists;
  if (Array.isArray(value?.templates)) return value.templates;
  if (Array.isArray(value?.campaigns)) return value.campaigns;
  return [];
};

const emptyCampaignPagination = { page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPrevPage: false, limit: 10 };

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignPagination, setCampaignPagination] = useState(emptyCampaignPagination);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [campaignQuery, setCampaignQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lists, setLists] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ name: "", templateId: "", listIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadWizardAssets = async () => {
    const [t, l, c] = await Promise.all([
      getTemplates(),
      getLists(),
      getContacts("page=1&limit=500"),
    ]);
    setTemplates(asArray(t.data));
    setLists(asArray(l.data));
    setContacts(asArray(c.data));
  };

  const fetchCampaignTable = async () => {
    try {
      const res = await getCampaigns({
        page: campaignPage,
        limit: campaignLimit,
        ...(campaignQuery ? { q: campaignQuery } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      });
      const data = res.data || {};
      setCampaigns(data.items || []);
      const p = data.pagination;
      setCampaignPagination(
        p
          ? { ...p, limit: p.limit ?? campaignLimit }
          : emptyCampaignPagination
      );
    } catch {
      setCampaigns([]);
      setCampaignPagination(emptyCampaignPagination);
    }
  };

  useEffect(() => {
    loadWizardAssets();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCampaignQuery(searchInput.trim());
      setCampaignPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchCampaignTable();
  }, [campaignPage, campaignLimit, campaignQuery, statusFilter]);
  const openModal = () => {
    setError("");
    setStep(1);
    const firstListId = lists[0]?._id || "";
    setForm({ name: "", templateId: templates[0]?._id || "", listIds: firstListId ? [firstListId] : [] });
    setOpen(true);
  };
  const next = () => {
    setError("");
    if (step === 1 && !form.name.trim()) return setError("Campaign name is required.");
    if (step === 2 && !form.templateId) return setError("Please select a template.");
    if (step === 3 && !(form.listIds || []).length) return setError("Please select at least one recipient list.");
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));
  const sendNow = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await createCampaign(form);
      await sendCampaign(data._id);
      setOpen(false);
      await loadWizardAssets();
      await fetchCampaignTable();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  };

  const getListCount = (listId) =>
    asArray(contacts).filter((c) => {
      const refs = Array.isArray(c.lists) ? c.lists : [];
      return refs.some((l) => String(l?._id || l) === String(listId));
    }).length;

  const getSelectedAudienceCount = (selectedIds) =>
    asArray(contacts).filter((c) => {
      const refs = Array.isArray(c.lists) ? c.lists : [];
      return refs.some((l) => selectedIds.includes(String(l?._id || l)));
    }).length;

  const selectedTemplate = templates.find((t) => t._id === form.templateId);
  const selectedListIds = (form.listIds || []).map(String);
  const selectedLists = lists.filter((l) => selectedListIds.includes(String(l._id)));
  const selectedAudienceCount = getSelectedAudienceCount(selectedListIds);

  return (
    <section className="campaigns-page">
      <div className="contacts-head">
        <div>
          <h2 className="dashboard-title">Campaigns</h2>
          <p className="dashboard-subtitle">Create, schedule, and track bulk email campaigns.</p>
        </div>
        <button className="danger-btn" onClick={openModal}><Plus size={14} /> New campaign</button>
      </div>

      <div className="contacts-table-wrap">
        <div className="contacts-toolbar campaigns-toolbar">
          <input
            type="search"
            className="contacts-search campaigns-search"
            placeholder="Search by campaign name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search campaigns"
          />
          <div className="campaigns-filter-wrap">
            <Filter size={14} aria-hidden />
            <label className="sr-only" htmlFor="campaign-status-filter">Status</label>
            <select
              id="campaign-status-filter"
              className="campaigns-status-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCampaignPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sending">Sending</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <table className="contacts-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Template</th>
              <th>List</th>
              <th>Status</th>
              <th>Created</th>
              <th>Sent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td className="name-cell">{c.name}</td>
                <td>{c.templateId?.name || "—"}</td>
                <td>
                  {Array.isArray(c.listIds) && c.listIds.length ? (
                    <span className="list-pill-wrap">
                      {c.listIds.slice(0, 2).map((l) => (
                        <span key={l._id} className="list-pill">{l?.name || "—"}</span>
                      ))}
                      {c.listIds.length > 2 ? <span className="list-pill list-pill-more">+{c.listIds.length - 2}</span> : null}
                    </span>
                  ) : (
                    <span className="list-pill">{c.listId?.name || "—"}</span>
                  )}
                </td>
                <td>
                  <span
                    className={`status-pill ${
                      c.status === "completed" ? "success" : c.status === "sending" ? "sending" : c.status === "failed" ? "failed" : "draft"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>{c.status === "completed" ? new Date(c.updatedAt).toLocaleDateString() : "—"}</td>
                <td>
                  <button type="button" className="ghost-btn campaigns-view-btn" onClick={() => navigate(`/campaigns/${c._id}`)}>
                    <Eye size={14} /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!campaigns.length ? (
          campaignPagination.total === 0 ? (
            <div className="analytics-empty">
              <div className="contacts-empty-icon"><Send size={24} /></div>
              <h3>No campaigns yet</h3>
              <p>Create your first campaign to start sending and tracking email performance.</p>
            </div>
          ) : (
            <div className="empty-row">No campaigns match your filters.</div>
          )
        ) : null}
        {campaignPagination.total > 0 ? (
          <div className="contacts-pagination campaigns-pagination">
            <span className="campaigns-page-meta">
              {campaignPagination.total} total · Page {campaignPagination.page} of {campaignPagination.totalPages}
            </span>
            <div className="campaigns-page-nav">
              <button
                type="button"
                className="ghost-btn"
                disabled={!campaignPagination.hasPrevPage}
                onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!campaignPagination.hasNextPage}
                onClick={() => setCampaignPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="modal-overlay campaign-modal-overlay" onClick={() => !busy && setOpen(false)}>
          <div
            className="contact-modal campaign-modal campaign-wizard-sheet"
            role="dialog"
            aria-labelledby="campaign-wizard-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="campaign-wizard-top">
              <div className="contact-modal-head campaign-wizard-head">
                <div>
                  <h3 id="campaign-wizard-title">Create campaign</h3>
                  <p className="campaign-wizard-subtitle">Step {step} of 4 — Name your campaign, pick a template, choose an audience, then send.</p>
                </div>
                <button type="button" className="modal-close campaign-wizard-close" onClick={() => !busy && setOpen(false)} aria-label="Close">
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              <nav className="wizard-steps campaign-wizard-steps" aria-label="Campaign steps">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`wizard-step ${i === step ? "current" : ""}`}>
                    <span className={`dot ${i < step ? "done" : i === step ? "active" : ""}`}>
                      {i < step ? <CheckCircle2 size={14} strokeWidth={2.5} aria-hidden /> : <span aria-hidden>{i}</span>}
                    </span>
                    <span className="label">{i === 1 ? "Name" : i === 2 ? "Template" : i === 3 ? "Audience" : "Send"}</span>
                  </div>
                ))}
              </nav>
            </div>

            <div className="campaign-wizard-scroll">
              {step === 1 ? (
                <div className="wizard-body campaign-wizard-pane">
                  <label className="campaign-field-label" htmlFor="campaign-name-input">Campaign name</label>
                  <input
                    id="campaign-name-input"
                    className="campaign-wizard-input"
                    placeholder="e.g. November newsletter"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoComplete="off"
                  />
                </div>
              ) : null}

              {step === 2 ? (
                <div className="wizard-body campaign-wizard-pane">
                  <label className="campaign-field-label" htmlFor="campaign-template-select">Template</label>
                  <button type="button" className="select-card campaign-select-preview" tabIndex={-1} aria-hidden>
                    <strong>{selectedTemplate?.name || "Untitled template"}</strong>
                    <small>{selectedTemplate?.subject || "Hello {{name}}"}</small>
                  </button>
                  <div className="select-wrap campaign-select-wrap">
                    <select
                      id="campaign-template-select"
                      className="campaign-wizard-select"
                      value={form.templateId}
                      onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                    >
                      <option value="">Select template</option>
                      {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={18} aria-hidden />
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="wizard-body campaign-wizard-pane campaign-wizard-audience-pane">
                  <label className="campaign-field-label">Recipient lists</label>
                  <div className="campaign-list-toolbar">
                    <span>{(form.listIds || []).length} selected</span>
                    <div className="campaign-list-toolbar-actions">
                      <button
                        type="button"
                        className="campaign-list-action"
                        onClick={() => setForm((prev) => ({ ...prev, listIds: lists.map((l) => String(l._id)) }))}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="campaign-list-action"
                        onClick={() => setForm((prev) => ({ ...prev, listIds: [] }))}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="campaign-list-multiselect" role="group" aria-label="Select recipient lists">
                    {lists.map((l) => {
                      const id = String(l._id);
                      const checked = selectedListIds.includes(id);
                      return (
                        <label key={id} className={`campaign-list-option ${checked ? "checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setForm((prev) => {
                                const current = (prev.listIds || []).map(String);
                                const nextIds = e.target.checked
                                  ? [...new Set([...current, id])]
                                  : current.filter((x) => x !== id);
                                return { ...prev, listIds: nextIds };
                              });
                            }}
                          />
                          <span className="campaign-list-copy">
                            <span className="campaign-list-title">{l.name}</span>
                            <span className="campaign-list-count">{getListCount(l._id)} contacts</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {(form.listIds || []).length ? (
                    <p className="campaign-wizard-helper">
                      This send will reach <strong>{selectedAudienceCount}</strong> {selectedAudienceCount === 1 ? "contact" : "contacts"} across <strong>{(form.listIds || []).length}</strong> {(form.listIds || []).length === 1 ? "list" : "lists"}.
                    </p>
                  ) : (
                    <p className="campaign-wizard-helper muted">Select one or more lists to see how many recipients are included.</p>
                  )}
                </div>
              ) : null}

              {step === 4 ? (
                <div className="wizard-body campaign-wizard-pane">
                  <label className="campaign-field-label">Review & send</label>
                  <div className="review-box campaign-review-box">
                    <p><span className="campaign-review-k">Campaign</span> {form.name}</p>
                    <p><span className="campaign-review-k">Template</span> {selectedTemplate?.name || "—"}</p>
                    <p>
                      <span className="campaign-review-k">Audience</span>
                      {selectedLists.length ? selectedLists.map((l) => l.name).join(", ") : "—"} · {selectedAudienceCount} contacts
                    </p>
                  </div>
                </div>
              ) : null}

              {error ? <p className="auth-error campaign-wizard-error" role="alert">{error}</p> : null}
            </div>

            <div className="campaign-wizard-footer">
              <button type="button" className="campaign-wizard-btn-back" onClick={back} disabled={step === 1 || busy}>
                Back
              </button>
              {step < 4 ? (
                <button type="button" className="campaign-wizard-btn-next" onClick={next}>
                  Continue
                </button>
              ) : (
                <button type="button" className="campaign-wizard-btn-send" onClick={sendNow} disabled={busy}>
                  {busy ? "Sending…" : "Send campaign"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
