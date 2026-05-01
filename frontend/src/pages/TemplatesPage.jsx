import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { AlertTriangle, Clock3, FileText, Save, Trash2, X } from "lucide-react";
import {
  createTemplate,
  deleteTemplate,
  getTemplates,
  updateTemplate,
  uploadTemplateAttachment,
  uploadTemplateImage,
} from "../services/templateService";
import TemplatePreview from "../components/TemplatePreview";
import EmailEditor from "../components/EmailEditor";

const defaultHtmlContent = "";
const defaultTemplateName = "";
const defaultTemplateSubject = "";

export default function TemplatesPage() {
  const completionDisposableRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [tab, setTab] = useState("wysiwyg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(defaultTemplateName);
  const [subject, setSubject] = useState(defaultTemplateSubject);
  const [htmlContent, setHtmlContent] = useState(defaultHtmlContent);
  const [attachments, setAttachments] = useState([]);
  const attachmentInputRef = useRef(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteModalInput, setDeleteModalInput] = useState("");
  const [showSampleReplaceModal, setShowSampleReplaceModal] = useState(false);

  const dataUrlToFile = (dataUrl, idx = 0) => {
    const arr = String(dataUrl || "").split(",");
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/data:([^;]+);base64/i);
    const mime = mimeMatch?.[1] || "image/png";
    const binary = atob(arr[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    return new File([bytes], `inline-image-${Date.now()}-${idx}.${ext}`, { type: mime });
  };

  const replaceInlineImagesWithPublicUrls = async (html) => {
    const input = String(html || "");
    if (!input || (!input.includes("blob:") && !input.includes("data:image"))) return input;
    const root = document.createElement("div");
    root.innerHTML = input;
    const nodes = Array.from(root.querySelectorAll("img[src]"));
    const targets = nodes.filter((img) => {
      const src = String(img.getAttribute("src") || "");
      return src.startsWith("blob:") || src.startsWith("data:image");
    });
    if (!targets.length) return input;

    const cache = new Map();
    for (let i = 0; i < targets.length; i += 1) {
      const node = targets[i];
      const src = String(node.getAttribute("src") || "");
      if (!src) continue;
      if (cache.has(src)) {
        node.setAttribute("src", cache.get(src));
        continue;
      }

      let file;
      if (src.startsWith("data:image")) {
        file = dataUrlToFile(src, i);
      } else {
        const blobRes = await fetch(src);
        const blob = await blobRes.blob();
        const mime = blob.type || "image/png";
        const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
        file = new File([blob], `template-image-${Date.now()}-${i}.${ext}`, { type: mime });
      }

      const uploadRes = await uploadTemplateImage(file);
      const url = uploadRes?.data?.url;
      if (!url) throw new Error("Image upload failed");
      cache.set(src, url);
      node.setAttribute("src", url);
    }
    return root.innerHTML;
  };

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
      setAttachments(Array.isArray(current.attachments) ? current.attachments : []);
    });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!deleteModal) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        setDeleteModal(null);
        setDeleteModalInput("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteModal, busy]);

  const openDeleteTemplateModal = (t) => {
    if (busy || !t?._id) return;
    setDeleteModal({ id: t._id, name: String(t.name || "").trim() || "Untitled" });
    setDeleteModalInput("");
  };

  const closeDeleteTemplateModal = () => {
    if (busy) return;
    setDeleteModal(null);
    setDeleteModalInput("");
  };

  const selectTemplate = (t) => {
    setActiveId(t._id);
    setName(t.name);
    setSubject(t.subject);
    setHtmlContent(t.html);
    setAttachments(Array.isArray(t.attachments) ? t.attachments : []);
  };

  const onNew = () => {
    setError("");
    setNotice("");
    setActiveId("");
    setTab("wysiwyg");
    setName(defaultTemplateName);
    setSubject(defaultTemplateSubject);
    setHtmlContent(defaultHtmlContent);
    setAttachments([]);
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
      payload.html = await replaceInlineImagesWithPublicUrls(payload.html);
      payload.attachments = attachments;
      const { data: saved } = activeId
        ? await updateTemplate(activeId, payload)
        : await createTemplate(payload);
      setActiveId(saved._id);
      setHtmlContent(saved.html ?? payload.html);
      setName(saved.name?.trim() ?? payload.name);
      setSubject(saved.subject?.trim() ?? payload.subject);
      setAttachments(Array.isArray(saved.attachments) ? saved.attachments : attachments);
      await load(saved._id);
      setNotice("Template saved successfully.");
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to save template.");
    } finally {
      setBusy(false);
    }
  };

  const executeTemplateDelete = async () => {
    if (!deleteModal?.id || busy || deleteModalInput !== "DELETE") return;
    const templateId = deleteModal.id;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteTemplate(templateId);
      const wasActive = String(activeId) === String(templateId);
      if (wasActive) onNew();
      setDeleteModal(null);
      setDeleteModalInput("");
      await load();
      setNotice("Template deleted.");
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to delete template.");
    } finally {
      setBusy(false);
    }
  };

  const deleteConfirmOk = deleteModalInput === "DELETE";

  const onPickAttachment = () => {
    attachmentInputRef.current?.click();
  };

  const onAttachmentSelected = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await uploadTemplateAttachment(file);
      const item = res?.data?.attachment;
      if (!item?.url) throw new Error("Attachment upload failed");
      setAttachments((prev) => [...prev, item]);
      setNotice("Attachment uploaded.");
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Unable to upload attachment.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
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
      </div>

      <div className="templates-layout three-col">
        <aside className="templates-list">
          <div className="templates-list-head">
            <div>
              <h4>All templates</h4>
              <p>{templates.length} total</p>
            </div>
            <button
              type="button"
              className="templates-list-add-btn"
              onClick={onNew}
              disabled={busy}
              title="Create new template"
              aria-label="Create new template"
            >
              <span aria-hidden>+</span>
            </button>
          </div>
          <div className="templates-list-body">
            {templates.length ? (
              templates.map((t) => (
                <div
                  key={t._id}
                  className={`template-item-wrap${activeId === t._id ? " active" : ""}`}
                >
                  <button type="button" className="template-item" onClick={() => selectTemplate(t)}>
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
                  <button
                    type="button"
                    className="template-item-delete"
                    aria-label={`Delete template ${t.name || "Untitled"}`}
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDeleteTemplateModal(t);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
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
            </div>
            <div className="row actions-right">
              <button className="ghost-btn" onClick={onPickAttachment} disabled={busy}>
                + Attachment
              </button>
              <button className="danger-btn templates-save-btn" onClick={save} disabled={busy}>
                <Save size={14} /> {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          {error ? <p className="auth-error">{error}</p> : null}
          {notice ? <p className="helper">{notice}</p> : null}
          {attachments.length ? (
            <div className="template-attachments">
              {attachments.map((a, idx) => (
                <div key={`${a.url}-${idx}`} className="template-attachment-chip">
                  <span title={a.name}>{a.name}</span>
                  <button type="button" className="delete-btn" onClick={() => removeAttachment(idx)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {tab === "html" ? (
            <Editor
              height="430px"
              defaultLanguage="html"
              value={htmlContent}
              onChange={(v) => setHtmlContent(v || "")}
              onMount={handleEditorMount}
              options={editorOptions}
            />
          ) : (
            <EmailEditor key={activeId || "new-template"} value={htmlContent} onChange={setHtmlContent} />
          )}
        </div>

        <TemplatePreview subject={subject} html={htmlContent} />
      </div>
      <input
        ref={attachmentInputRef}
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAttachmentSelected(file);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {deleteModal ? (
        <div className="modal-overlay template-delete-overlay" onClick={() => !busy && closeDeleteTemplateModal()}>
          <div
            className="contact-modal template-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-delete-title"
            aria-describedby="template-delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="template-delete-dialog__header">
              <div className="template-delete-dialog__header-main">
                <span className="template-delete-dialog__warn" aria-hidden="true">
                  <AlertTriangle size={22} strokeWidth={2.25} />
                </span>
                <div className="template-delete-dialog__titles">
                  <h3 id="template-delete-title">Delete template</h3>
                  <p id="template-delete-desc">
                    This will permanently remove the template and all of its associated data. This action cannot be undone.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="template-delete-dialog__close"
                onClick={closeDeleteTemplateModal}
                aria-label="Close"
                disabled={busy}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="template-delete-dialog__info">
              <span className="template-delete-dialog__info-label">Template</span>
              <strong className="template-delete-dialog__info-name">{deleteModal.name}</strong>
            </div>

            <div className="template-delete-dialog__body">
              <label className="template-delete-dialog__field" htmlFor="template-delete-confirm-input">
                <span className="template-delete-dialog__field-label">To confirm, type DELETE below</span>
                <input
                  id="template-delete-confirm-input"
                  className="template-delete-dialog__input"
                  value={deleteModalInput}
                  onChange={(e) => setDeleteModalInput(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  autoFocus
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="template-delete-dialog__footer">
              <button type="button" className="template-delete-dialog__btn-cancel" onClick={closeDeleteTemplateModal} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="template-delete-dialog__btn-delete"
                onClick={() => executeTemplateDelete()}
                disabled={busy || !deleteConfirmOk}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden />
                {busy ? "Deleting…" : "Delete template"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
