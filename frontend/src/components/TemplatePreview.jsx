import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Laptop, Mail, Smartphone } from "lucide-react";

const sampleData = {
  name: "John",
  company: "Google",
  email: "john@google.com",
};

const applyPreviewVariables = (html) =>
  String(html || "").replace(/{{\s*(name|company|email)\s*}}/gi, (_, key) => sampleData[key.toLowerCase()] || "");

export default function TemplatePreview({ subject, html }) {
  const [mode, setMode] = useState("desktop");

  const renderedHtml = useMemo(() => {
    const merged = applyPreviewVariables(html);
    return DOMPurify.sanitize(merged);
  }, [html]);

  return (
    <aside className="template-preview-pane">
      <div className="preview-top">
        <div>
          <h4>Live preview</h4>
          <p>As your recipient sees it</p>
        </div>
        <div className="preview-toggle">
          <button className={mode === "desktop" ? "active" : ""} onClick={() => setMode("desktop")}>
            <Laptop size={14} /> Desktop
          </button>
          <button className={mode === "mobile" ? "active" : ""} onClick={() => setMode("mobile")}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>
      </div>

      <div className={`email-shell ${mode}`}>
        <div className="email-shell-head">
          <div><span>From</span><strong>Your Company &lt;hello@company.com&gt;</strong></div>
          <div><span>To</span><strong>{sampleData.email}</strong></div>
          <div><span>Subject</span><strong>{subject || "No subject"}</strong></div>
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
    </aside>
  );
}
