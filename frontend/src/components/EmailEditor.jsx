import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

/**
 * Gmail-style WYSIWYG for email HTML. Uses Quill 1.3 directly because react-quill
 * still calls findDOMNode, which React 19 removed (same API as requested: value + onChange).
 */
const toolbarOptions = [
  ["bold", "italic", "underline"],
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ size: ["small", false, "large", "huge"] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  ["link"],
  [{ color: [] }, { background: [] }],
  ["clean"],
];

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "size",
  "list",
  "bullet",
  "indent",
  "align",
  "link",
  "image", // keep whitelist so existing <img> in HTML is preserved; toolbar has no upload button
  "color",
  "background",
];

function stripEmptyParagraph(html) {
  const t = (html ?? "").trim();
  if (!t) return "";
  if (/^<p><br\s*\/?><\/p>$/i.test(t)) return "";
  if (t === "<p></p>") return "";
  return html ?? "";
}

function sameDocHtml(a, b) {
  return stripEmptyParagraph(a) === stripEmptyParagraph(b);
}

export default function EmailEditor({ value, onChange }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedHtmlRef = useRef(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const quill = new Quill(el, {
      theme: "snow",
      modules: {
        toolbar: {
          container: toolbarOptions,
        },
      },
      formats,
      placeholder: "Compose your email…",
    });
    quillRef.current = quill;

    const onTextChange = (_d, _o, source) => {
      if (source !== "user") return;
      const html = quill.root.innerHTML;
      lastEmittedHtmlRef.current = html;
      onChangeRef.current(html);
    };
    quill.on("text-change", onTextChange);

    return () => {
      quill.off("text-change", onTextChange);
      // Toolbar is inserted as a sibling before quill.container (see quill/modules/toolbar.js),
      // so clearing only el.innerHTML leaves duplicate .ql-toolbar nodes on remount (e.g. Strict Mode).
      const parent = el.parentNode;
      if (parent) {
        parent.querySelectorAll(":scope > .ql-toolbar").forEach((node) => node.remove());
      }
      el.classList.remove("ql-container", "ql-snow");
      el.innerHTML = "";
      quillRef.current = null;
      lastEmittedHtmlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const next = value ?? "";
    const prev = lastEmittedHtmlRef.current;
    if (prev !== null && sameDocHtml(next, prev)) {
      return;
    }
    const delta = quill.clipboard.convert(next || "<p><br></p>");
    quill.setContents(delta, "silent");
    lastEmittedHtmlRef.current = quill.root.innerHTML;
  }, [value]);

  return (
    <div className="email-editor-wrap">
      <div ref={containerRef} />
    </div>
  );
}
