import { useEffect, useState } from "react";
import { useRef } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from "../services/templateService";
import TemplatePreview from "../components/TemplatePreview";
import EmailVisualBuilder from "../components/EmailVisualBuilder";

export default function TemplatesPage() {
  const completionDisposableRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [tab, setTab] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    name: "Welcome Email",
    subject: "Welcome to {{company}}, {{name}}!",
    html: `<div style="font-family:Arial,sans-serif;padding:24px;background:#fff">
  <h1 style="color:#d94a27">Hi {{name}},</h1>
  <p>Welcome aboard! We're thrilled to have you at <strong>{{company}}</strong>.</p>
  <p><a href="https://example.com/start" style="background:#d94a27;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Get started</a></p>
  <p style="color:#888;font-size:12px">- The Team</p>
</div>`,
  });
  const load = () =>
    getTemplates().then((r) => {
      const rows = Array.isArray(r.data) ? r.data : r.data?.items || r.data?.templates || [];
      setTemplates(rows);
      if (!rows.length) return;
      const current = rows.find((t) => t._id === activeId) || rows[0];
      setActiveId(current._id);
      setForm({ name: current.name, subject: current.subject, html: current.html });
    });

  useEffect(() => { load(); }, []);

  const selectTemplate = (t) => {
    setActiveId(t._id);
    setForm({ name: t.name, subject: t.subject, html: t.html });
  };

  const onNew = () => {
    setError("");
    setNotice("");
    setActiveId("");
    setForm({
      name: "New Template",
      subject: "Welcome to {{company}}, {{name}}!",
      html: "<h1>Hello {{name}}</h1><p>We're happy to have you.</p>",
    });
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      subject: form.subject.trim(),
      html: form.html.trim(),
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
      if (activeId) {
        const { data } = await updateTemplate(activeId, payload);
        setActiveId(data._id);
      } else {
        const { data } = await createTemplate(payload);
        setActiveId(data._id);
      }
      await load();
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
        <button className="danger-btn templates-new-btn" onClick={onNew}><Plus size={14} /> New Template</button>
      </div>

      <div className="templates-layout three-col">
        <aside className="templates-list">
          {templates.length ? templates.map((t) => (
            <button key={t._id} className={`template-item${activeId === t._id ? " active" : ""}`} onClick={() => selectTemplate(t)}>
              <strong><FileText size={14} /> {t.name}</strong>
              <p>{t.subject}</p>
              <small>Updated {new Date(t.updatedAt || t.createdAt).toLocaleDateString()}</small>
            </button>
          )) : <div className="empty-row">No templates yet.</div>}
        </aside>

        <div className="template-editor-card middle">
          <div className="template-meta">
            <input placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Subject line" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="template-controls">
            <div className="tabs">
              <button className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>HTML editor</button>
              <button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>Visual builder</button>
              <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Eye size={14} /> Preview tab</button>
            </div>
            <div className="row actions-right">
              <button className="ghost-btn" onClick={remove} disabled={busy || !activeId}><Trash2 size={14} /> Delete</button>
              <button className="danger-btn templates-save-btn" onClick={save} disabled={busy}>
                <Save size={14} /> {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          {error ? <p className="auth-error">{error}</p> : null}
          {notice ? <p className="helper">{notice}</p> : null}
          {tab === "editor" ? (
            <Editor
              height="430px"
              defaultLanguage="html"
              value={form.html}
              onChange={(v) => setForm({ ...form, html: v || "" })}
              onMount={handleEditorMount}
              options={editorOptions}
            />
          ) : tab === "builder" ? (
            <EmailVisualBuilder value={form.html} onChange={(html) => setForm({ ...form, html })} />
          ) : (
            <div className="template-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.html) }} />
          )}
        </div>

        <TemplatePreview subject={form.subject} html={form.html} />
      </div>
    </section>
  );
}
