import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Laptop, Smartphone } from "lucide-react";

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
        <h4>Live Preview</h4>
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
          <div><strong>From:</strong> Your Company</div>
          <div><strong>To:</strong> {sampleData.email}</div>
          <div><strong>Subject:</strong> {subject || "No subject"}</div>
        </div>
        <div className="email-shell-body">
          <div className="template-preview full" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
      </div>
    </aside>
  );
}
