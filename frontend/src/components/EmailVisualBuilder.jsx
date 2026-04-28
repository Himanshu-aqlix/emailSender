import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { Download } from "lucide-react";

const FALLBACK_HTML = "<div style='padding:16px;font-family:Arial,sans-serif;'>Start building your email...</div>";

const splitMarkup = (markup = "") => {
  if (!markup) {
    return { html: FALLBACK_HTML, css: "" };
  }

  if (typeof window === "undefined") {
    return { html: markup, css: "" };
  }

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div id="builder-root">${markup}</div>`, "text/html");
  const styleTags = Array.from(doc.querySelectorAll("style"));
  const css = styleTags.map((tag) => tag.textContent || "").join("\n").trim();
  styleTags.forEach((tag) => tag.remove());
  const html = doc.body.querySelector("#builder-root")?.innerHTML || markup;

  return { html: html || FALLBACK_HTML, css };
};

const buildMarkup = (editor) => {
  const html = editor.getHtml();
  const css = editor.getCss();
  return css ? `<style>${css}</style>${html}` : html;
};

export default function EmailVisualBuilder({ value, onChange }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const syncingFromPropsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: "430px",
      width: "auto",
      fromElement: false,
      storageManager: false,
      selectorManager: { componentFirst: true },
      canvas: {
        styles: [],
      },
    });

    editor.BlockManager.add("text-block", {
      label: "Text",
      category: "Basic",
      content: `<div style="padding:10px;font-family:Arial,sans-serif;">Edit this text...</div>`,
    });
    editor.BlockManager.add("image-block", {
      label: "Image",
      category: "Basic",
      content: `<img src="https://via.placeholder.com/600x200" alt="image" style="max-width:100%;display:block;" />`,
    });
    editor.BlockManager.add("button-block", {
      label: "Button",
      category: "Basic",
      content: `<a href="#" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Call to action</a>`,
    });
    editor.BlockManager.add("divider-block", {
      label: "Divider",
      category: "Basic",
      content: `<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0;" />`,
    });

    editor.on("update", () => {
      if (syncingFromPropsRef.current) return;
      onChange?.(buildMarkup(editor));
    });

    const { html, css } = splitMarkup(value);
    editor.setComponents(html);
    editor.setStyle(css);
    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [onChange, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextMarkup = value || "";
    if (buildMarkup(editor) === nextMarkup) return;
    const { html, css } = splitMarkup(nextMarkup);
    syncingFromPropsRef.current = true;
    editor.setComponents(html);
    editor.setStyle(css);
    syncingFromPropsRef.current = false;
  }, [value]);

  const exportHtml = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange?.(buildMarkup(editor));
  };

  return (
    <div className="visual-builder-wrap">
      <div className="visual-builder-toolbar">
        <button className="ghost-btn" onClick={exportHtml}><Download size={14} /> Export HTML</button>
      </div>
      <div ref={containerRef} className="grapes-root" />
    </div>
  );
}
