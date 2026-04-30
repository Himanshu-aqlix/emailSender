const resolveBaseUrl = () => {
  const fromEnv = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || process.env.SERVER_PUBLIC_URL;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim().replace(/\/+$/, "");
  return "http://localhost:5000";
};

const baseUrl = resolveBaseUrl();

const OPEN_MARKER = "data-track-open=\"1\"";
const CLICK_MARKER = "data-track-click=\"1\"";
const UNSUB_MARKER = "data-track-unsubscribe=\"1\"";

const TEXT_URL_REGEX = /(^|[\s>(\["'])((?:https?:\/\/)[^\s<>"')\]]+)/gi;

const linkifyPlainUrls = (html = "") => {
  const source = String(html || "");
  if (!source) return source;

  const parts = source.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  let insideScript = false;
  let insideStyle = false;

  return parts
    .map((part) => {
      if (!part) return part;
      if (part.startsWith("<")) {
        const tagNameMatch = part.match(/^<\s*\/?\s*([a-z0-9:-]+)/i);
        const tagName = (tagNameMatch?.[1] || "").toLowerCase();
        const isClosing = /^<\s*\//.test(part);

        if (tagName === "a") insideAnchor = !isClosing;
        if (tagName === "script") insideScript = !isClosing;
        if (tagName === "style") insideStyle = !isClosing;
        return part;
      }

      if (insideAnchor || insideScript || insideStyle) return part;

      return part.replace(TEXT_URL_REGEX, (full, lead, url) => {
        if (!url) return full;
        return `${lead}<a href="${url}">${url}</a>`;
      });
    })
    .join("");
};

const injectTracking = ({ html, campaignId, email, logId }) => {
  try {
    const safeHtml = String(html || "");
    const cid = encodeURIComponent(String(campaignId || ""));
    const em = encodeURIComponent(String(email || "").trim().toLowerCase());
    const lid = encodeURIComponent(String(logId || ""));

    if (!safeHtml || !cid || !em) return safeHtml;

    let tracked = linkifyPlainUrls(safeHtml);

    if (!tracked.includes(CLICK_MARKER)) {
      const anchorRegex = /<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/gi;
      tracked = tracked.replace(anchorRegex, (full, preAttrs, quote, href, postAttrs) => {
        const url = String(href || "").trim();
        if (!url) return full;
        if (url.startsWith("mailto:") || url.startsWith("tel:")) return full;
        if (url.includes("/api/track/click")) return full;

        const logPart = lid ? `&logId=${lid}` : "";
        const trackedUrl = `${baseUrl}/api/track/click?campaignId=${cid}&email=${em}${logPart}&redirect=${encodeURIComponent(url)}`;
        return `<a${preAttrs}href="${trackedUrl}" ${CLICK_MARKER}${postAttrs}>`;
      });
    }

    if (!tracked.includes(OPEN_MARKER)) {
      const logPart = lid ? `?logId=${lid}` : "";
      const pixel =
        `<img src="${baseUrl}/api/track/open/${cid}/${em}${logPart}" width="1" height="1" alt="" style="display:none;" ${OPEN_MARKER} />`;
      tracked = `${tracked}${pixel}`;
    }

    if (!tracked.includes(UNSUB_MARKER)) {
      const unsub =
        `<p style="margin-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#64748b;">` +
        `If you no longer want these emails, <a href="${baseUrl}/api/unsubscribe?email=${em}" ${UNSUB_MARKER}>unsubscribe</a>.` +
        `</p>`;
      tracked = `${tracked}${unsub}`;
    }

    return tracked;
  } catch (error) {
    console.error("[tracking] injectTracking failed:", error?.message || error);
    return String(html || "");
  }
};

module.exports = { injectTracking };
