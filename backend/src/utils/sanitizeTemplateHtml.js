const sanitizeHtml = require("sanitize-html");

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
});

function sanitizeTemplateHtml(html) {
  return sanitizeHtml(html == null ? "" : String(html), templateHtmlSanitizeOptions);
}

module.exports = {
  sanitizeTemplateHtml,
};
