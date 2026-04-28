import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Filter, Plus, Send, X } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", templateId: "", listId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadWizardAssets = async () => {
    const [t, l, c] = await Promise.all([getTemplates(), getLists(), getContacts()]);
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
    setForm({ name: "", templateId: templates[0]?._id || "", listId: lists[0]?._id || "" });
    setOpen(true);
  };
  const next = () => {
    setError("");
    if (step === 1 && !form.name.trim()) return setError("Campaign name is required.");
    if (step === 2 && !form.templateId) return setError("Please select a template.");
    if (step === 3 && !form.listId) return setError("Please select a recipient list.");
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

  const getListCount = (listId) => asArray(contacts).filter((c) => {
    const id = typeof c.listId === "object" ? c.listId?._id : c.listId;
    return String(id) === String(listId);
  }).length;

  const selectedTemplate = templates.find((t) => t._id === form.templateId);
  const selectedList = lists.find((l) => l._id === form.listId);

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
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td className="name-cell">{c.name}</td>
                <td>{c.templateId?.name || "—"}</td>
                <td><span className="list-pill">{c.listId?.name || "—"}</span></td>
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
                <div className="wizard-body campaign-wizard-pane">
                  <label className="campaign-field-label" htmlFor="campaign-list-select">Recipient list</label>
                  <div className="select-wrap campaign-select-wrap">
                    <select
                      id="campaign-list-select"
                      className="campaign-wizard-select"
                      value={form.listId}
                      onChange={(e) => setForm({ ...form, listId: e.target.value })}
                    >
                      <option value="">Select a list</option>
                      {lists.map((l) => <option key={l._id} value={l._id}>{l.name} ({getListCount(l._id)} contacts)</option>)}
                    </select>
                    <ChevronDown size={18} aria-hidden />
                  </div>
                  {selectedList ? (
                    <p className="campaign-wizard-helper">
                      This send will reach <strong>{getListCount(selectedList._id)}</strong> {getListCount(selectedList._id) === 1 ? "contact" : "contacts"} in <strong>{selectedList.name}</strong>.
                    </p>
                  ) : (
                    <p className="campaign-wizard-helper muted">Select a list to see how many recipients are included.</p>
                  )}
                </div>
              ) : null}

              {step === 4 ? (
                <div className="wizard-body campaign-wizard-pane">
                  <label className="campaign-field-label">Review & send</label>
                  <div className="review-box campaign-review-box">
                    <p><span className="campaign-review-k">Campaign</span> {form.name}</p>
                    <p><span className="campaign-review-k">Template</span> {selectedTemplate?.name || "—"}</p>
                    <p><span className="campaign-review-k">Audience</span> {selectedList?.name || "—"} · {selectedList ? getListCount(selectedList._id) : 0} contacts</p>
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
