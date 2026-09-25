/* Azzurro Technology inc. — safe rendering policy for untrusted pod content.
 *
 * Everything this site renders from a pod table (`/s/data/azzurrotech/…`) is
 * untrusted input: the pod tables are writable by the platform, and any field
 * can be edited without a deploy. This module is the *only* place that decides
 * how such a value is allowed to reach the DOM:
 *
 *   esc(str)              → HTML-escape for text that is built into markup
 *   safeUrl(value, opts)  → a validated URL, or opts.fallback
 *   parseRichText(html)   → a plain-data node tree (tag/attrs/children/text)
 *   isEmail(str)          → the checkout's address check
 *   clampQty(n)           → cart quantity clamping
 *
 * parseRichText never returns markup as a string. It returns data, and app.js
 * turns that data into real DOM nodes with createElement/setAttribute/
 * createTextNode. No code path that touches pod data invokes an HTML parser,
 * so a hostile record cannot inject script, event handlers, styles or
 * resource-loading markup even if every filter here were bypassed.
 *
 * Deliberately dependency-free and DOM-free so it can be unit-tested in plain
 * Node (see ../tests/safe.test.js) and loaded in the browser as
 * window.AzSafe.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AzSafe = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---- text escaping ------------------------------------------------------ */

  var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /** esc — escape a value for interpolation into an HTML string. */
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ESCAPES[c];
    });
  }

  var NAMED_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    hellip: "…", mdash: "—", ndash: "–", copy: "©",
    reg: "®", trade: "™", deg: "°", euro: "€",
    pound: "£", laquo: "«", raquo: "»"
  };

  /**
   * decodeEntities — turn character references into their characters. The
   * result is plain text that will be inserted with createTextNode, so it is
   * never re-parsed as markup. Unknown references are left verbatim.
   */
  function decodeEntities(text) {
    return String(text == null ? "" : text).replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g,
      function (whole, body) {
        if (body.charAt(0) === "#") {
          var hex = body.charAt(1) === "x" || body.charAt(1) === "X";
          var code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
          if (!isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
          // Surrogates and NUL are not useful text; refuse them.
          if (code >= 0xd800 && code <= 0xdfff) return whole;
          try { return String.fromCodePoint(code); } catch (e) { return whole; }
        }
        var named = NAMED_ENTITIES[body.toLowerCase()];
        return named === undefined ? whole : named;
      });
  }

  /* ---- URL validation ------------------------------------------------------ */

  var DEFAULT_PROTOCOLS = { href: ["http:", "https:", "mailto:"], src: ["http:", "https:"] };
  var MAX_URL_LENGTH = 2048;
  // Characters browsers strip or ignore while resolving a URL. If any of them
  // is present we refuse the value rather than try to repair it: that closes
  // the "java\tscript:" / "java&#10;script:" style scheme-smuggling tricks.
  var SUSPECT_URL_CHARS = /[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2060\u3000\ufeff]/;

  /**
   * safeUrl — validate a URL that came from pod data.
   *
   * @param {string} value       untrusted URL
   * @param {object} [opts]
   * @param {string} [opts.kind]  "href" (default) or "src"
   * @param {string} [opts.fallback] returned when the value is not safe
   * @returns {string} the URL, or opts.fallback (default "")
   */
  function safeUrl(value, opts) {
    opts = opts || {};
    var kind = opts.kind === "src" ? "src" : "href";
    var allowed = opts.protocols || DEFAULT_PROTOCOLS[kind];
    var fallback = opts.fallback == null ? "" : String(opts.fallback);

    if (value == null) return fallback;
    var url = String(value).trim();
    if (!url) return fallback;
    if (url.length > MAX_URL_LENGTH) return fallback;
    if (SUSPECT_URL_CHARS.test(url)) return fallback;
    // Backslashes are normalised to "/" by browsers, which turns "\\host" and
    // "/\host" into protocol-relative or absolute URLs. Refuse them outright.
    if (url.indexOf("\\") !== -1) return fallback;
    // Protocol-relative URLs would silently leave the site.
    if (url.slice(0, 2) === "//") return fallback;

    var scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
    if (scheme) {
      if (allowed.indexOf(scheme[1].toLowerCase() + ":") === -1) return fallback;
      return url;
    }
    // No scheme: a same-document or relative reference. Reject anything that
    // could be re-interpreted as absolute once a base is applied.
    if (url.charAt(0) === ":" || url.charAt(0) === "@") return fallback;
    return url;
  }

  // A non-empty sentinel, so an accepted URL is always distinguishable from a
  // rejected one ("" is a legitimate result only when no fallback was asked for).
  var REJECTED = ":rejected";

  /** isSafeHref / isSafeSrc — boolean form, for validation and tests. */
  function isSafeHref(value) {
    return safeUrl(value, { kind: "href", fallback: REJECTED }) !== REJECTED;
  }
  function isSafeSrc(value) {
    return safeUrl(value, { kind: "src", fallback: REJECTED }) !== REJECTED;
  }

  /* ---- rich-text policy ---------------------------------------------------- */

  // Tags that may appear in the output, mapped to the attributes they keep.
  // Anything not listed here is dropped (its tag, not necessarily its text).
  var ALLOWED_TAGS = {
    p: {}, br: {}, hr: {},
    h2: {}, h3: {}, h4: {},
    strong: {}, b: {}, em: {}, i: {}, u: {}, s: {}, sub: {}, sup: {},
    code: {}, pre: {}, blockquote: {},
    ul: {}, ol: {}, li: {},
    a: { href: true }
  };

  // Elements whose *text* is dropped along with the tag: their content is raw
  // text or markup that must never surface as page text (script/style bodies,
  // embedded objects, alternative content, …).
  var DROP_SUBTREE = {
    script: true, style: true, iframe: true, object: true, embed: true,
    applet: true, template: true, noscript: true, canvas: true, svg: true,
    math: true, textarea: true, title: true, head: true, xmp: true,
    plaintext: true, listing: true, audio: true, video: true, source: true,
    track: true, link: true, meta: true, base: true, form: true, input: true,
    button: true, select: true, option: true, optgroup: true, datalist: true,
    frame: true, frameset: true, map: true, area: true, dialog: true, marquee: true
  };

  // Block-level elements that are not in ALLOWED_TAGS: they carry no meaning we
  // render, but they do separate blocks, so they act as a paragraph boundary.
  var TRANSPARENT_BLOCKS = {
    div: true, section: true, article: true, main: true, header: true,
    footer: true, aside: true, nav: true, figure: true, figcaption: true,
    address: true, dl: true, dt: true, dd: true, table: true, thead: true,
    tbody: true, tfoot: true, tr: true, td: true, th: true, caption: true,
    center: true, details: true, summary: true
  };

  var INLINE_TAGS = {
    a: true, b: true, em: true, i: true, u: true, s: true, sub: true,
    sup: true, code: true, br: true, span: true, small: true, mark: true
  };

  var TAG_PATTERN = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*)?>/g;
  var ATTR_PATTERN = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;
  var BLANK_LINE = /\n[ \t\r]*\n/;

  function stripQuotes(value) {
    if (value.length > 1 && (value.charAt(0) === '"' || value.charAt(0) === "'")) {
      return value.slice(1, -1);
    }
    return value;
  }

  function isVoidTag(tag) { return tag === "br" || tag === "hr"; }

  /**
   * parseRichText — turn an untrusted string into a sanitised node tree.
   *
   * Returns { root, text, stats } where root.children is a list of node specs
   * ({ tag, attrs, children } / { text }) that app.js converts into DOM nodes.
   * `text` is the plain-text equivalent, handy for excerpts and tests.
   *
   * Plain text is supported on purpose: seed bodies are prose, and prose must
   * not need markup to be readable. Blank lines start a new paragraph.
   */
  function parseRichText(input, opts) {
    opts = opts || {};
    var maxNodes = opts.maxNodes || 5000;
    var maxChars = opts.maxChars || (1 << 20);
    var src = String(input == null ? "" : input);
    if (src.length > maxChars) src = src.slice(0, maxChars);
    var root = { tag: "#root", attrs: {}, children: [] };
    var stack = [root];
    var stats = { tags: 0, droppedTags: 0, droppedAttrs: 0, nodes: 0 };
    var suppressDepth = 0; // >0 while inside a DROP_SUBTREE element
    var suppressTag = "";

    function top() { return stack[stack.length - 1]; }

    function pushNode(node) {
      if (stats.nodes >= maxNodes) return false;
      stats.nodes += 1;
      top().children.push(node);
      return true;
    }

    function isOpen(tag) {
      for (var i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) return i;
      return -1;
    }

    function inPre() {
      for (var i = stack.length - 1; i > 0; i--) if (stack[i].tag === "pre") return true;
      return false;
    }

    function closeImplicit() {
      while (stack.length > 1 && stack[stack.length - 1].implicit) stack.pop();
    }

    function openElement(tag, attrs, implicit) {
      var node = { tag: tag, attrs: attrs || {}, children: [], implicit: !!implicit };
      if (!pushNode(node)) return top();
      if (!isVoidTag(tag)) stack.push(node);
      return node;
    }

    function closeElement(tag) {
      var at = isOpen(tag);
      if (at < 0) return; // stray close tag: ignore
      while (stack.length - 1 >= at) {
        var node = stack.pop();
        if (node.implicit && node.tag === "p" && !node.children.length) {
          // drop an empty paragraph wrapper
          var parent = top();
          var kids = parent.children;
          var idx = kids.lastIndexOf(node);
          if (idx !== -1) kids.splice(idx, 1);
        }
      }
    }

    function addText(raw) {
      if (suppressDepth > 0 || !raw) return;
      var text = decodeEntities(raw);
      if (!text) return;
      if (inPre()) {
        // Inside <pre>, whitespace is significant, so keep it verbatim.
        if (top().tag === "#root") openElement("pre", null, true);
        pushNode({ text: text });
        return;
      }
      text = text.replace(/\s+/g, " ");
      if (!text) return;
      // A text run at the document root opens an implicit paragraph.
      if (top().tag === "#root") openElement("p", null, true);
      pushNode({ text: text });
    }

    // Text run, split on blank lines so plain prose becomes paragraphs.
    function addTextRun(raw) {
      if (suppressDepth > 0 || !raw) return;
      var parts = String(raw).split(BLANK_LINE);
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) closeImplicit();
        addText(parts[i]);
      }
    }

    function flushBlock() {
      closeImplicit();
    }

    function parseAttrs(tag, raw) {
      var allowed = Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, tag) ? ALLOWED_TAGS[tag] : {};
      var attrs = {};
      if (!raw) return attrs;
      ATTR_PATTERN.lastIndex = 0;
      var m;
      while ((m = ATTR_PATTERN.exec(raw)) !== null) {
        var name = m[1].toLowerCase();
        // Only attributes this tag is explicitly allowed to keep survive.
        if (!allowed[name]) { stats.droppedAttrs += 1; continue; }
        if (name === "href") {
          var href = safeUrl(decodeEntities(stripQuotes(m[2] || "")), {
            kind: "href",
            fallback: ""
          });
          if (!href) { stats.droppedTags += 1; continue; }
          attrs.href = href;
          continue;
        }
        attrs[name] = decodeEntities(stripQuotes(m[2] === undefined ? "" : m[2]));
      }
      return attrs;
    }

    TAG_PATTERN.lastIndex = 0;
    var pos = 0;
    while (pos < src.length && stats.nodes < maxNodes) {
      TAG_PATTERN.lastIndex = pos;
      var match = TAG_PATTERN.exec(src);
      if (!match) break;
      if (match.index > pos) addTextRun(src.slice(pos, match.index));
      pos = TAG_PATTERN.lastIndex;

      var isClose = match[1] === "/";
      var tag = match[2].toLowerCase();

      if (suppressDepth > 0) {
        // Inside script/style/…: only the matching close tag matters.
        if (isClose && tag === suppressTag) suppressDepth -= 1;
        continue;
      }
      if (DROP_SUBTREE[tag]) {
        if (!isClose) { suppressDepth += 1; suppressTag = tag; }
        stats.droppedTags += 1;
        continue;
      }
      if (isClose) {
        if (Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, tag)) closeElement(tag);
        else if (TRANSPARENT_BLOCKS[tag]) flushBlock();
        continue; // unknown or void close tags are meaningless
      }
      if (Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, tag)) {
        var selfClosing = /\/\s*$/.test(match[3] || "");
        // An inline element at the document root still needs a paragraph.
        if (INLINE_TAGS[tag] && top().tag === "#root") openElement("p", null, true);
        if (isVoidTag(tag)) {
          pushNode({ tag: tag, attrs: parseAttrs(tag, match[3]), children: [] });
        } else {
          openElement(tag, parseAttrs(tag, match[3]), false);
          if (selfClosing) closeElement(tag);
        }
        stats.tags += 1;
        continue;
      }
      if (TRANSPARENT_BLOCKS[tag]) { flushBlock(); continue; }
      // Unknown tag: keep its source as text rather than silently deleting
      // content. It can never become markup because addText creates a text
      // node, and this preserves a literal <img onerror=…> payload for the
      // reader instead of pretending the article did not contain it.
      stats.droppedTags += 1;
      addText(match[0]);
    }
    if (pos < src.length && stats.nodes < maxNodes) addTextRun(src.slice(pos));
    while (stack.length > 1) stack.pop();

    return { root: root, text: nodeText(root), stats: stats };
  }

  // Block-level elements get a separator when flattened to text, so the
  // plain-text form of a document stays readable.
  var TEXT_BLOCKS = {
    p: true, h2: true, h3: true, h4: true, li: true, blockquote: true,
    pre: true, ul: true, ol: true, hr: true, br: true, div: true,
    section: true, article: true, table: true, tr: true
  };

  /** nodeText — flatten a parsed node tree back to plain text. */
  function nodeText(node) {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    var out = "";
    (node.children || []).forEach(function (child) {
      out += nodeText(child);
      if (child.tag && TEXT_BLOCKS[child.tag]) out += " ";
    });
    return out;
  }

  /** hasMarkup — true when a value looks like it contains tags at all. */
  function hasMarkup(value) {
    return /<\s*\/?\s*[a-zA-Z!][^>]*>/.test(String(value == null ? "" : value));
  }

  /* ---- small value helpers ------------------------------------------------ */

  var EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@,;:<>()[\]\\.]+(?:\.[^\s@,;:<>()[\]\\.]+)+$/;

  /** isEmail — the address check used by the checkout workflow. */
  function isEmail(value) {
    if (typeof value !== "string") return false;
    var email = value.trim();
    if (!email || email.length > 254) return false;
    return EMAIL_RE.test(email);
  }

  /** clampQty — cart quantities are whole positive numbers, bounded. */
  function clampQty(value, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n < 1) n = 1;
    var cap = max || 99;
    return n > cap ? cap : n;
  }

  /** isTruthyFlag — pod columns are text, so "true"/"1"/"yes" all count. */
  function isTruthyFlag(value) {
    if (value === true) return true;
    var s = String(value == null ? "" : value).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
  }

  return {
    esc: esc,
    decodeEntities: decodeEntities,
    safeUrl: safeUrl,
    isSafeHref: isSafeHref,
    isSafeSrc: isSafeSrc,
    parseRichText: parseRichText,
    nodeText: nodeText,
    hasMarkup: hasMarkup,
    isEmail: isEmail,
    clampQty: clampQty,
    isTruthyFlag: isTruthyFlag,
    ALLOWED_TAGS: ALLOWED_TAGS,
    DROP_SUBTREE: DROP_SUBTREE
  };
});
