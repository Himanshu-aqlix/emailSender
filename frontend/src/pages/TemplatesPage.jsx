import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { Clock3, Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from "../services/templateService";
import TemplatePreview from "../components/TemplatePreview";
import EmailEditor from "../components/EmailEditor";

const defaultHtmlContent = `<div style="font-family:Arial,sans-serif;padding:24px;background:#fff">
  <h1 style="color:#d94a27">Hi {{name}},</h1>
  <p>Welcome aboard! We're thrilled to have you at <strong>{{company}}</strong>.</p>
  <p><a href="https://example.com/start" style="background:#d94a27;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Get started</a></p>
  <p style="color:#888;font-size:12px">- The Team</p>
</div>`;
const defaultTemplateName = "Welcome Email";
const defaultTemplateSubject = "Welcome to {{company}}, {{name}}!";

export default function TemplatesPage() {
  const completionDisposableRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [tab, setTab] = useState("html");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(defaultTemplateName);
  const [subject, setSubject] = useState(defaultTemplateSubject);
  const [htmlContent, setHtmlContent] = useState(defaultHtmlContent);

  /** @param {string} [preferredTemplateId] — pass after save so we select the saved row (fixes stale closure with new templates). */
  const load = (preferredTemplateId) =>
    getTemplates().then((r) => {
      const rows = Array.isArray(r.data) ? r.data : r.data?.items || r.data?.templates || [];
      setTemplates(rows);
      if (!rows.length) return;
      const id = preferredTemplateId !== undefined ? preferredTemplateId : activeId;
      const current =
        rows.find((t) => String(t._id) === String(id)) ||
        rows[0];
      setActiveId(current._id);
      setName(current.name);
      setSubject(current.subject);
      setHtmlContent(current.html);
    });

  useEffect(() => {
    load();
  }, []);

  const selectTemplate = (t) => {
    setActiveId(t._id);
    setName(t.name);
    setSubject(t.subject);
    setHtmlContent(t.html);
  };

  const onNew = () => {
    setError("");
    setNotice("");
    setActiveId("");
    setName(defaultTemplateName);
    setSubject(defaultTemplateSubject);
    setHtmlContent(defaultHtmlContent);
  };

  const save = async () => {
    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      html: htmlContent.trim(),
    };

    if (!payload.name || !payload.subject || !payload.html) {
      setError("Template name, subject, and content are required.");
      setNotice("");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { data: saved } = activeId
        ? await updateTemplate(activeId, payload)
        : await createTemplate(payload);
      setActiveId(saved._id);
      setHtmlContent(saved.html ?? htmlContent.trim());
      setName(saved.name?.trim() ?? payload.name);
      setSubject(saved.subject?.trim() ?? payload.subject);
      await load(saved._id);
      setNotice("Template saved successfully.");
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to save template.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!activeId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteTemplate(activeId);
      onNew();
      await load();
      setNotice("Template deleted.");
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to delete template.");
    } finally {
      setBusy(false);
    }
  };

  const editorOptions = {
    lineNumbers: "on",
    minimap: { enabled: true },
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: "always",
    autoClosingQuotes: "always",
    autoClosingComments: "always",
    autoIndent: "full",
    tabSize: 2,
    wordWrap: "on",
    scrollBeyondLastLine: false,
  };

  const handleEditorMount = (editor, monaco) => {
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
    }

    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider("html", {
      triggerCharacters: ["{"],
      provideCompletionItems: (model, position) => {
        const textUntilCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        if (!textUntilCursor.endsWith("{{")) {
          return { suggestions: [] };
        }

        const makeSuggestion = (label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `${label}}}`,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          detail: "Template variable",
          documentation: `Insert {{${label}}}`,
        });

        return {
          suggestions: [makeSuggestion("name"), makeSuggestion("email"), makeSuggestion("company")],
        };
      },
    });

    editor.onDidPaste(() => {
      editor.getAction("editor.action.formatDocument")?.run();
    });
  };

  return (
    <section className="templates-page">
      <div className="templates-head">
        <div>
          <h2 className="dashboard-title">Templates</h2>
          <p className="dashboard-subtitle">Design HTML emails with personalization variables like {"{{name}}"}.</p>
        </div>
        <button className="danger-btn templates-new-btn" onClick={onNew}>
          <Plus size={14} /> New Template
        </button>
      </div>

      <div className="templates-layout three-col">
        <aside className="templates-list">
          <div className="templates-list-head">
            <div>
              <h4>All templates</h4>
              <p>{templates.length} total</p>
            </div>
            <button type="button" className="templates-list-add" onClick={onNew} aria-label="Create template">
              <Plus size={16} />
            </button>
          </div>
          <div className="templates-list-body">
            {templates.length ? (
              templates.map((t) => (
                <button
                  key={t._id}
                  className={`template-item${activeId === t._id ? " active" : ""}`}
                  onClick={() => selectTemplate(t)}
                >
                  <span className="template-item-icon">
                    <FileText size={14} />
                  </span>
                  <div className="template-item-body">
                    <div className="template-item-top">
                      <strong>{t.name}</strong>
                      <span className={`template-state ${activeId === t._id ? "active" : "draft"}`}>
                        {activeId === t._id ? "Active" : "Draft"}
                      </span>
                    </div>
                    <p>{t.subject}</p>
                    <small><Clock3 size={12} /> Updated {new Date(t.updatedAt || t.createdAt).toLocaleDateString()}</small>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-row">No templates yet.</div>
            )}
          </div>
        </aside>

        <div className="template-editor-card middle">
          <div className="template-meta">
            <label className="template-meta-field">
              <span>Template Name</span>
              <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="template-meta-field">
              <span>Subject Line</span>
              <input placeholder="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
          </div>
          <div className="template-controls">
            <div className="tabs">
              <button className={tab === "html" ? "active" : ""} onClick={() => setTab("html")}>
                HTML editor
              </button>
              <button className={tab === "wysiwyg" ? "active" : ""} onClick={() => setTab("wysiwyg")}>
                Editor
              </button>
              <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
                <Eye size={14} /> Preview
              </button>
            </div>
            <div className="row actions-right">
              <button className="ghost-btn" onClick={remove} disabled={busy || !activeId}>
                <Trash2 size={14} /> Delete
              </button>
              <button className="danger-btn templates-save-btn" onClick={save} disabled={busy}>
                <Save size={14} /> {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          {error ? <p className="auth-error">{error}</p> : null}
          {notice ? <p className="helper">{notice}</p> : null}
          {tab === "html" ? (
            <Editor
              height="430px"
              defaultLanguage="html"
              value={htmlContent}
              onChange={(v) => setHtmlContent(v || "")}
              onMount={handleEditorMount}
              options={editorOptions}
            />
          ) : tab === "wysiwyg" ? (
            <EmailEditor key={activeId || "new-template"} value={htmlContent} onChange={setHtmlContent} />
          ) : (
            <div
              className="template-preview"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
            />
          )}
        </div>

        <TemplatePreview subject={subject} html={htmlContent} />
      </div>
    </section>
  );
}
