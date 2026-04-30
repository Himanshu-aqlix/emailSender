const sanitizeHtml = require("sanitize-html");

const normalizeImgStyle = (style = "") => {
  const value = String(style || "").trim();
  const trimmed = value.replace(/\s+/g, " ");
  const withSemi = trimmed && !trimmed.endsWith(";") ? `${trimmed};` : trimmed;
  // Avoid duplicating required rules if they already exist.
  const lc = withSemi.toLowerCase();
  const needsWidth = !lc.includes("width:");
  const needsMax = !lc.includes("max-width");
  const needsHeight = !lc.includes("height:");
  const needsDisplay = !lc.includes("display:");
  const needsMarginLeft = !lc.includes("margin-left");
  const needsMarginRight = !lc.includes("margin-right");
  return `${withSemi}${needsWidth ? "width:40%;" : ""}${needsMax ? "max-width:40%;" : ""}${needsHeight ? "height:auto;" : ""}${needsDisplay ? "display:block;" : ""}${needsMarginLeft ? "margin-left:0;" : ""}${needsMarginRight ? "margin-right:auto;" : ""}`;
};

/**
 * Email templates need inline CSS (style="..."). The default sanitize-html profile
 * only allows href/target on <a>, so saves stripped almost all markup back to bare text/layout.
 */
const templateHtmlSanitizeOptions = Object.assign({}, sanitizeHtml.defaults, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: Object.assign({}, sanitizeHtml.defaults.allowedAttributes, {
    "*": ["style", "class"],
    a: ["href", "name", "target", "rel", "style", "class"],
    img: ["src", "srcset", "alt", "title", "width", "height", "loading", "style", "class"],
    table: ["width", "border", "cellpadding", "cellspacing", "bgcolor", "role", "style", "class"],
    tbody: ["style", "class"],
    thead: ["style", "class"],
    tfoot: ["style", "class"],
    tr: ["style", "class"],
    td: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor", "style", "class"],
    th: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor", "style", "class"],
    colgroup: ["span", "style", "class"],
    col: ["span", "width", "style", "class"],
  }),
  transformTags: {
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        style: normalizeImgStyle(attribs?.style),
        loading: attribs?.loading || "lazy",
      },
    }),
  },
});

function sanitizeTemplateHtml(html) {
  return sanitizeHtml(html == null ? "" : String(html), templateHtmlSanitizeOptions);
}

module.exports = {
  sanitizeTemplateHtml,
};
