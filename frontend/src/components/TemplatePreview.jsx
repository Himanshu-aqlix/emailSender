import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Copy, Laptop, Mail, Smartphone } from "lucide-react";
import { successToast } from "../utils/toast";

const SAMPLE_CAMPAIGN_NAME = "Sample campaign";

/** Keys used in preview replacements (values from sampleRecipient). Order does not drive replacement. */
const VARIABLE_GROUPS = [
  {
    label: "Contact info",
    keys: ["name", "email", "phone", "company"],
  },
  {
    label: "Campaign info",
    keys: ["campaign_name"],
  },
  {
    label: "System variables",
    keys: ["date"],
  },
];

function buildSampleRecipient(sampleCampaignTitle) {
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return {
    name: "John",
    email: "john@gmail.com",
    phone: "+1 555 010 2030",
    company: "Acme Corp",
    date,
    campaign_name: sampleCampaignTitle || SAMPLE_CAMPAIGN_NAME,
  };
}

/** Lowercase lookup for placeholders (matches backend replaceVariables). */
function normalizeSampleMap(sample) {
  const m = {};
  Object.entries(sample).forEach(([k, v]) => {
    m[String(k).toLowerCase()] = v;
  });
  return m;
}

function applyPreviewVariables(html, sampleMap) {
  return String(html || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/gi, (_, rawKey) => {
    const key = String(rawKey).toLowerCase();
    const v = sampleMap[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

export default function TemplatePreview({ subject, html, sampleCampaignTitle }) {
  const [desktopMode, setDesktopMode] = useState("desktop");
  const [viewMode, setViewMode] = useState("preview");

  const sampleRecipient = useMemo(() => buildSampleRecipient(sampleCampaignTitle), [sampleCampaignTitle]);
  const sampleMap = useMemo(() => normalizeSampleMap(sampleRecipient), [sampleRecipient]);

  const renderedHtml = useMemo(() => {
    const merged = applyPreviewVariables(html, sampleMap);
    return DOMPurify.sanitize(merged);
  }, [html, sampleMap]);

  const previewSubject = useMemo(() => applyPreviewVariables(subject || "", sampleMap), [subject, sampleMap]);

  const copyToken = async (key) => {
    const token = `{{${key}}}`;
    try {
      await navigator.clipboard.writeText(token);
      successToast(`Copied {{${key}}}`, { toastId: `copy-var-${key}` });
    } catch {
      successToast(`Could not copy ${token}`, { toastId: "copy-var-fail" });
    }
  };

  return (
    <aside className="template-preview-pane">
      <div className="preview-viewmode-bar" role="tablist" aria-label="Preview or variables">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "preview"}
          className={`preview-viewmode-btn ${viewMode === "preview" ? "is-active" : ""}`}
          onClick={() => setViewMode("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "variables"}
          className={`preview-viewmode-btn ${viewMode === "variables" ? "is-active" : ""}`}
          onClick={() => setViewMode("variables")}
        >
          Variables
        </button>
      </div>

      <div className="template-preview-pane-inner">
        <div className="preview-header-row">
          <div className="preview-header-text">
            <h4>{viewMode === "preview" ? "Live preview" : "Personalization tokens"}</h4>
            <p>{viewMode === "preview" ? "As your recipient sees it" : "Copy placeholders into HTML or subject"}</p>
          </div>
          {viewMode === "preview" ? (
            <div className="preview-toggle preview-toggle--viewport" aria-label="Preview width">
              <button type="button" className={desktopMode === "desktop" ? "active" : ""} onClick={() => setDesktopMode("desktop")}>
                <Laptop size={14} /> Desktop
              </button>
              <button type="button" className={desktopMode === "mobile" ? "active" : ""} onClick={() => setDesktopMode("mobile")}>
                <Smartphone size={14} /> Mobile
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === "preview" ? (
          <div className={`email-shell ${desktopMode}`}>
          <div className="email-shell-head">
            <div><span>From</span><strong>Your Company &lt;hello@company.com&gt;</strong></div>
            <div><span>To</span><strong>{sampleRecipient.email}</strong></div>
            <div><span>Subject</span><strong>{previewSubject || "No subject"}</strong></div>
          </div>
          <div className="email-shell-body">
            <div className="template-preview full">
              <div className="preview-mail-bar">
                <span><i /> <i /> <i /></span>
                <Mail size={13} />
              </div>
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            </div>
          </div>
          <p className="preview-note">Personalization tokens render with sample data</p>
          </div>
        ) : (
          <div className="template-variables-panel">
          <p className="template-variables-intro">Click a row to copy a token.</p>
          {VARIABLE_GROUPS.map((group) => (
            <section key={group.label} className="template-variables-group">
              <h5 className="template-variables-group-title">{group.label}</h5>
              <ul className="template-variables-list">
                {group.keys.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="template-variable-row"
                      title="Click to copy"
                      onClick={() => copyToken(key)}
                    >
                      <code className="template-variable-code">{`{{${key}}}`}</code>
                      <span className="template-variable-hint">{String(sampleRecipient[key] ?? "—")}</span>
                      <Copy size={15} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          </div>
        )}
      </div>
    </aside>
  );
}
