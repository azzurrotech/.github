/* Azzurro Technology inc. — azzurro.tech application layer.
 *
 * Hosted as a static site inside the azzurrotech client's silo on the
 * stenella platform. There is no backend code of our own: content comes from
 * the client's pod tables through stenella's public site-data endpoint, and
 * all four Emperor42 libraries are loaded from the platform's canonical copy
 * (/s/static/lib/*.js).
 *
 *   veni — custom elements: az-product-card, az-post-card
 *   vidi — pod output rendered as cards (posts listing page)
 *   vici — cookie-backed cart and browser storage helpers
 *   vini — checkout workflow with progress persisted in localStorage
 *
 * safe.js (loaded before this file) owns the policy for untrusted pod
 * content. Nothing read from /s/data/azzurrotech/ is ever assigned to an HTML
 * parser: nodes are built element by element, URLs are validated, and
 * post bodies go through AzSafe.parseRichText, which returns a data tree
 * rather than markup.
 *
 * Vanilla ES6 only. No libraries beyond the four above, no CDNs.
 */

(function () {
  "use strict";

  var DATA = "/s/data/azzurrotech"; // pod tables, public read-only JSON
  var BOOKING_URL = "https://calendar.proton.me/bookings#jAF1YRNT6csw0T6JMUk_xrmoMHHuyWWuBSC7JYvpGE0=";
  var CONTACT_EMAIL = "info@azzurro.tech";
  var S = window.AzSafe;

  /* ---- safe DOM helpers ---------------------------------------------------- */

  function boot1() {
    if (S) return;
    // safe.js did not load. Refuse to render anything rather than fall back
    // to a path that treats pod data as markup.
    document.addEventListener("DOMContentLoaded", function () {
      var main = document.querySelector("main");
      if (main) main.textContent = "This page could not load its rendering policy (safe.js).";
    });
  }
  boot1();

  /* An <img> whose source came from pod data: the URL is validated and the
   * attribute set through setAttribute, so nothing is escaped (and nothing is
   * double-escaped — esc() on a URL would corrupt query separators). */
  function imageFor(p) {
    var raw = S.decodeEntities(p && p.image);
    var src = S.safeUrl(raw, { kind: "src", fallback: "" }) || "assets/logo.png";
    return el("img", {
      src: src,
      alt: String((p && p.name) || ""),
      loading: "lazy",
      decoding: "async"
    });
  }

  /* Build a DOM node from scratch. There is deliberately no "html" key: every
   * attribute is set with setAttribute and every child is a node or a text
   * string, so pod content cannot inject markup through this helper. */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2), v);
        } else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* Turn an AzSafe node tree into real DOM. Only tags the policy allowlists
   * reach this function, and the single attribute it can carry (a href) has
   * already been validated by safeUrl. */
  function appendTree(parent, spec) {
    (spec || []).forEach(function (node) {
      if (node == null) return;
      if (typeof node.text === "string") {
        parent.appendChild(document.createTextNode(node.text));
        return;
      }
      if (typeof node.tag !== "string" || !S.ALLOWED_TAGS ||
          !Object.prototype.hasOwnProperty.call(S.ALLOWED_TAGS, node.tag)) return;
      var dom = el(node.tag);
      Object.keys(node.attrs || {}).forEach(function (name) {
        if (name !== "href") return;
        var href = S.safeUrl(node.attrs[name], { kind: "href", fallback: "" });
        if (!href) return;
        dom.setAttribute("href", href);
        if (/^https?:/i.test(href)) { // links out of post bodies
          dom.setAttribute("rel", "noopener noreferrer");
          dom.setAttribute("target", "_blank");
        }
      });
      appendTree(dom, node.children);
      parent.appendChild(dom);
    });
    return parent;
  }

  /* Empty a container without invoking an HTML parser. */
  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function qsa(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  function money(n) {
    var num = parseFloat(n);
    if (!isFinite(num)) return "$0.00";
    return "$" + num.toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    // Parse YYYY-MM-DD as a *local* date so the displayed day never shifts
    // across timezones (new Date("2026-06-01") is midnight UTC).
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (m) {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return longDate(d);
    }
    var t = new Date(iso);
    if (isNaN(t.getTime())) return String(iso);
    return longDate(t);
  }

  function longDate(d) {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function toast(msg) {
    var box = qs("#toast");
    if (!box) {
      box = el("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove("show"); }, 3200);
  }

  /* ---- pod data: treat every value as untrusted ---------------------------- */

  function fetchTable(table, opts) {
    var url = DATA + "/" + encodeURIComponent(table);
    var q = new URLSearchParams();
    if (opts) {
      Object.keys(opts).forEach(function (k) {
        if (opts[k] != null && opts[k] !== "") q.set(k, opts[k]);
      });
    }
    var s = q.toString();
    if (s) url += "?" + s;
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error(table + ": HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return (data && Array.isArray(data.records)) ? data.records : [];
      });
  }

  function byId(rows, id) {
    if (!id) return null;
    var needle = String(id);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      if (r.id === needle || r.slug === needle) return r;
    }
    return null;
  }

  function isOnSale(p) {
    return !!(p && S.isTruthyFlag(p.on_sale) && parseFloat(p.sale_price) > 0);
  }

  function isConsultationProduct(p) {
    return !!(p && (p.id === "azzurro-consulting-call" || p.slug === "azzurro-consulting-call"));
  }

  function bookingLink(text, className) {
    return el("a", {
      class: className || "btn",
      href: BOOKING_URL,
      target: "_blank",
      rel: "noopener noreferrer",
      text: text || "Book a free consultation"
    });
  }

  function unitPrice(p) {
    return isOnSale(p) ? parseFloat(p.sale_price) : parseFloat(p.price);
  }

  function detailHref(prefix, row) {
    var key = (row && (row.slug || row.id)) || "";
    return prefix + "?slug=" + encodeURIComponent(key);
  }

  /* ---- cart — cookie-backed through vici (localStorage fallback) -----------
   * cart shape: [ { id, qty }, … ]; item details are read from pod data at
   * render time so prices always reflect the published table. The cookie and
   * its localStorage mirror hold nothing but product ids and quantities. */

  var CART_KEY = "azzurro_cart";
  var CART_MAX_LINES = 50;
  var CART_MAX_QTY = 99;

  function viciGet(name) {
    if (window.vici && window.vici.cookieGet) {
      var v = window.vici.cookieGet(name);
      if (v != null) return v;
    }
    try { return window.localStorage.getItem(name); } catch (e) { return null; }
  }

  function viciSet(name, value) {
    if (window.vici && window.vici.cookieSet) {
      window.vici.cookieSet(name, value, 30, {
        path: "/",
        sameSite: "Lax",
        secure: window.location.protocol === "https:"
      });
    }
    try { window.localStorage.setItem(name, value); } catch (e) { /* ignore */ }
  }

  function viciDel(name) {
    if (window.vici && window.vici.cookieDelete) window.vici.cookieDelete(name, { path: "/" });
    try { window.localStorage.removeItem(name); } catch (e) { /* ignore */ }
  }

  var cart = {
    _items: [],
    load: function () {
      this._items = [];
      try {
        var parsed = viciGet(CART_KEY) ? JSON.parse(viciGet(CART_KEY)) : [];
        if (!Array.isArray(parsed)) return this._items;
        var seen = {};
        for (var i = 0; i < parsed.length && this._items.length < CART_MAX_LINES; i++) {
          var item = parsed[i];
          if (!item || typeof item.id !== "string") continue;
          var id = item.id.slice(0, 200);
          if (!id || seen[id]) continue;
          seen[id] = true;
          this._items.push({ id: id, qty: S.clampQty(item.qty, CART_MAX_QTY) });
        }
      } catch (e) {
        this._items = [];
      }
      return this._items;
    },
    save: function () {
      viciSet(CART_KEY, JSON.stringify(this._items));
      this.paint();
    },
    count: function () {
      return this._items.reduce(function (n, i) { return n + i.qty; }, 0);
    },
    add: function (id, qty) {
      if (!id || this._items.length >= CART_MAX_LINES && !this._has(id)) {
        toast("Your cart is full.");
        return;
      }
      var line = this._has(id);
      if (line) line.qty = S.clampQty(line.qty + (qty || 1), CART_MAX_QTY);
      else this._items.push({ id: String(id), qty: S.clampQty(qty || 1, CART_MAX_QTY) });
      this.save();
      toast("Added to cart");
    },
    _has: function (id) {
      for (var i = 0; i < this._items.length; i++) if (this._items[i].id === id) return this._items[i];
      return null;
    },
    setQty: function (id, qty) {
      var line = this._has(id);
      if (!line) return;
      line.qty = S.clampQty(qty, CART_MAX_QTY);
      this.save();
    },
    remove: function (id) {
      this._items = this._items.filter(function (i) { return i.id !== id; });
      this.save();
    },
    clear: function () {
      this._items = [];
      viciDel(CART_KEY);
      this.save();
    },
    lines: function (productsById) {
      var out = [];
      var map = productsById || {};
      this._items.forEach(function (li) {
        var p = map[li.id];
        if (p) out.push({ product: p, qty: li.qty, unit: unitPrice(p) });
      });
      return out;
    },
    total: function (lines) {
      return (lines || []).reduce(function (n, l) {
        var unit = parseFloat(l.unit);
        return n + (isFinite(unit) ? unit : 0) * l.qty;
      }, 0);
    },
    paint: function () {
      var n = cart.count();
      qsa("[data-cart-badge]").forEach(function (b) {
        b.textContent = n;
        b.classList.toggle("hidden", n === 0);
      });
    }
  };

  /* ---- veni: custom elements ---------------------------------------------
   * Defined through veni so they are discovered, registered and upgraded on
   * every page via veni.init(). Light DOM (no shadow) so the site stylesheet
   * applies. Data is bound as a property before insertion. */

  function cardShell(thumb, priceNode) {
    var root = el("article", { class: "card" });
    if (thumb) {
      var t = el("div", { class: "thumb" });
      t.appendChild(thumb);
      root.appendChild(t);
    }
    var body = el("div", { class: "body" });
    if (priceNode) body.appendChild(priceNode);
    root.appendChild(body);
    return { root: root, body: body };
  }

  function priceNode(p, big) {
    var price = el("div", { class: "price" + (big ? " big" : "") });
    if (isConsultationProduct(p)) {
      price.appendChild(el("span", { text: "Free consultation" }));
    } else if (isOnSale(p)) {
      price.appendChild(el("span", { class: "old", text: money(p.price) }));
      price.appendChild(el("span", { class: "sale-price", text: money(p.sale_price) }));
    } else {
      price.appendChild(el("span", { text: money(p.price) }));
    }
    return price;
  }

  window.AzProductCard = class AzProductCard extends HTMLElement {
    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;
      var p = this.product || {};
      var shell = cardShell(imageFor(p), priceNode(p));
      if (isOnSale(p) && shell.root.firstChild) {
        shell.root.firstChild.appendChild(el("span", { class: "badge", text: "Sale" }));
      }
      shell.body.appendChild(el("h3", {}, [
        el("a", { href: detailHref("product.html", p), text: p.name || "" })
      ]));
      shell.body.appendChild(el("p", { class: "excerpt", text: p.short || p.description || "" }));
      var act = el("div", { class: "actions" });
      if (isConsultationProduct(p)) {
        act.appendChild(bookingLink("Book a free consultation", "btn small"));
      } else {
        act.appendChild(el("button", {
          class: "btn small",
          text: "Add to cart",
          onclick: function () { cart.add(p.id, 1); }
        }));
      }
      act.appendChild(el("a", {
        class: "btn small ghost",
        href: detailHref("product.html", p),
        text: "Details"
      }));
      shell.body.appendChild(act);
      this.appendChild(shell.root);
    }
  };

  window.AzPostCard = class AzPostCard extends HTMLElement {
    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;
      var post = this.post || {};
      var shell = cardShell(null, null);
      shell.body.appendChild(el("p", {
        class: "meta",
        text: (post.category || "Article") + " · " + fmtDate(post.date)
      }));
      shell.body.appendChild(el("h3", {}, [
        el("a", { href: detailHref("post.html", post), text: post.title || "" })
      ]));
      shell.body.appendChild(el("p", { class: "excerpt", text: post.excerpt || "" }));
      shell.body.appendChild(el("a", {
        class: "btn small ghost",
        href: detailHref("post.html", post),
        text: "Read more"
      }));
      this.appendChild(shell.root);
    }
  };

  function defineComponents() {
    if (window.veni && window.veni.define) {
      window.veni.define("az-product-card", window.AzProductCard);
      window.veni.define("az-post-card", window.AzPostCard);
      if (window.veni.init) window.veni.init();
      return;
    }
    // Keep the page useful if the optional helper is unavailable; the browser
    // Custom Elements registry is the platform primitive veni wraps.
    if (window.customElements) {
      if (!window.customElements.get("az-product-card")) {
        window.customElements.define("az-product-card", window.AzProductCard);
      }
      if (!window.customElements.get("az-post-card")) {
        window.customElements.define("az-post-card", window.AzPostCard);
      }
    }
  }

  /* ---- shared renderers ---------------------------------------------------- */

  function renderProductCards(container, products, limit) {
    if (!container) return;
    clear(container);
    if (!products.length) {
      container.appendChild(el("p", { class: "muted", text: "No products published yet." }));
      return;
    }
    products.slice(0, limit || products.length).forEach(function (p) {
      var card = document.createElement("az-product-card");
      card.product = p;
      container.appendChild(card);
    });
  }

  function renderPostCards(container, posts, limit) {
    if (!container) return;
    clear(container);
    if (!posts.length) {
      container.appendChild(el("p", { class: "muted", text: "No posts published yet." }));
      return;
    }
    posts.slice(0, limit || posts.length).forEach(function (post) {
      var card = document.createElement("az-post-card");
      card.post = post;
      container.appendChild(card);
    });
  }

  function sortBy(rows, key, desc) {
    return rows.slice().sort(function (a, b) {
      var av = a && a[key] != null ? String(a[key]) : "";
      var bv = b && b[key] != null ? String(b[key]) : "";
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }

  function unavailable(container, message) {
    if (!container) return;
    clear(container);
    container.appendChild(el("p", { class: "muted", text: message }));
  }

  /* ---- nav chrome ---------------------------------------------------------- */

  function wireNav() {
    var toggle = qs(".mobile-menu-toggle");
    var links = qs(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", function () { links.classList.toggle("open"); });
    }
    cart.paint();
  }

  /* ---- pages ---------------------------------------------------------------- */

  function pageHome() {
    var grid = qs("#hero-products");
    if (grid) {
      fetchTable("products")
        .then(function (rows) {
          var featured = rows.filter(function (p) { return S.isTruthyFlag(p.featured); });
          renderProductCards(grid, sortBy(featured, "order", false), 4);
        })
        .catch(function () { unavailable(grid, "Products are not available right now."); });
    }
    var latest = qs("#latest-posts");
    if (latest) {
      fetchTable("posts")
        .then(function (rows) { renderPostCards(latest, sortBy(rows, "date", true), 3); })
        .catch(function () { unavailable(latest, "Posts are not available right now."); });
    }
    var contact = qs("#contact-form");
    if (contact) {
      contact.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = qs("#cf-name", contact).value.trim();
        var email = qs("#cf-email", contact).value.trim();
        var msg = qs("#cf-message", contact).value.trim();
        if (!S.isEmail(email)) { toast("Please enter a valid email address."); return; }
        // No backend: hand the message to the visitor's mail client.
        var subject = encodeURIComponent("Contact — azzurro.tech");
        var body = encodeURIComponent(msg + "\n\n— " + name + " (" + email + ")");
        window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + subject + "&body=" + body;
        toast("Opening your mail app…");
      });
    }
  }

  function pageShop() {
    var grid = qs("#product-grid");
    if (!grid) return;
    fetchTable("products")
      .then(function (rows) { renderProductCards(grid, sortBy(rows, "order", false), 100); })
      .catch(function () { unavailable(grid, "Products are not available right now."); });
  }

  function pageProduct() {
    var slug = params().get("slug");
    var box = qs("#product-detail");
    if (!box) return;
    fetchTable("products")
      .then(function (rows) {
        var p = byId(rows, slug);
        if (!p) { unavailable(box, "Product not found."); return; }
        var crumb = qs("#crumb-name");
        if (crumb) crumb.textContent = p.name || "Product";
        document.title = (p.name || "Product") + " — Azzurro Technology inc.";

        clear(box);
        box.appendChild(el("div", { class: "thumb" }, [imageFor(p)]));
        var info = el("div", { class: "info" });
        if (isOnSale(p)) info.appendChild(el("span", { class: "badge", text: "Sale" }));
        info.appendChild(el("h1", { text: p.name || "" }));
        info.appendChild(priceNode(p, true));
        info.appendChild(el("p", { text: p.description || p.short || "" }));
        if (isConsultationProduct(p)) {
          info.appendChild(el("p", { class: "notice", text: "Free discovery call; no obligation." }));
        }
        var act = el("div", { class: "row" });
        if (isConsultationProduct(p)) {
          act.appendChild(bookingLink("Book a free consultation", "btn"));
        } else {
          act.appendChild(el("button", {
            class: "btn", text: "Add to cart", onclick: function () { cart.add(p.id, 1); }
          }));
        }
        act.appendChild(el("a", { class: "btn secondary", href: "shop.html", text: "Browse the shop" }));
        info.appendChild(act);
        if (isOnSale(p)) {
          info.appendChild(el("p", { class: "notice", text: "Launch pricing — the cart shows the sale price." }));
        }
        box.appendChild(info);
      })
      .catch(function () { unavailable(box, "Product is not available right now."); });
  }

  function cartPage() {
    if (!qs("#cart-lines")) return;
    var advance = qs(".wf-advance");
    if (advance) advance.addEventListener("click", function () { checkout.advance(); });
    var cancel = qs("#checkout-cancel");
    if (cancel) cancel.addEventListener("click", function () { checkout.cancel(); });
    var checkoutBtn = qs("#checkout-btn");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", function () { checkout.start(); });
    }
    checkout.init();
    checkout.restore();
    renderCart();
  }

  function productsByIdCache() {
    if (productsByIdCache._c) return Promise.resolve(productsByIdCache._c);
    return fetchTable("products")
      .then(function (rows) {
        var map = {};
        rows.forEach(function (p) {
          if (p && p.id) map[p.id] = p;
          if (p && p.slug) map[p.slug] = p;
        });
        productsByIdCache._c = map;
        return map;
      })
      .catch(function (err) {
        productsByIdCache._c = null;
        throw err;
      });
  }

  function renderCart() {
    var linesBox = qs("#cart-lines");
    var totalBox = qs("#cart-total");
    var emptyBox = qs("#cart-empty");
    var checkoutBtn = qs("#checkout-btn");
    if (!linesBox) return;
    productsByIdCache()
      .then(function (byIdMap) {
        var lines = cart.lines(byIdMap);
        clear(linesBox);
        if (!lines.length) {
          if (emptyBox) emptyBox.classList.remove("hidden");
          if (totalBox) totalBox.textContent = "Total: $0.00";
          if (checkoutBtn) checkoutBtn.disabled = true;
          return;
        }
        if (emptyBox) emptyBox.classList.add("hidden");
        lines.forEach(function (l) { linesBox.appendChild(cartLineEl(l)); });
        if (totalBox) totalBox.textContent = "Total: " + money(cart.total(lines));
        if (checkoutBtn) checkoutBtn.disabled = false;
      })
      .catch(function () {
        unavailable(linesBox, "The catalogue could not be loaded, so the cart cannot be totalled.");
        if (totalBox) totalBox.textContent = "Total: —";
        if (checkoutBtn) checkoutBtn.disabled = true;
      });
  }

  function cartLineEl(line) {
    var p = line.product;
    var row = el("div", { class: "cart-line" });
    row.appendChild(el("div", { class: "thumb" }, [imageFor(p)]));
    var info = el("div", { class: "info" });
    info.appendChild(el("h4", {}, [
      el("a", { href: detailHref("product.html", p), text: p.name || "" })
    ]));
    info.appendChild(el("p", { class: "muted", text: money(line.unit) + " each" }));
    row.appendChild(info);
    var qty = el("input", {
      class: "qty", type: "number", min: "1", max: String(CART_MAX_QTY),
      value: String(line.qty), "aria-label": "Quantity for " + (p.name || "this item")
    });
    qty.addEventListener("change", function () {
      cart.setQty(line.product.id, qty.value);
      renderCart();
    });
    row.appendChild(qty);
    row.appendChild(el("span", { text: money(parseFloat(line.unit || 0) * line.qty) }));
    row.appendChild(el("button", {
      class: "btn small ghost",
      text: "Remove",
      onclick: function () { cart.remove(line.product.id); renderCart(); }
    }));
    return row;
  }

  /* ---- vini: checkout workflow --------------------------------------------
   *
   * What this is: a client-side demonstration of the vini workflow engine.
   * It is NOT a purchase. No payment is collected, no order is created, no
   * message is sent to Azzurro, and the email typed into it is never
   * transmitted — it stays in this browser (a vini draft in sessionStorage)
   * so the workflow can be resumed after a reload.
   *
   * vini notes that shape the code below:
   *   - events are CustomEvents, so the workflow is at e.detail.workflow;
   *   - listeners are appended, never replaced, so init() must run once;
   *   - vini persists the workflow as JSON, so the validate() callbacks are
   *     gone after a reload: re-attach them without losing the saved step;
   *   - continue() is a no-op unless status is "running".
   */

  var checkout = {
    wfId: "azzurro-checkout",
    draftKey: "azzurro_checkout_draft",
    _inited: false,
    _loadingReview: false,

    _steps: function () {
      return [
        {
          id: "contact",
          title: "Where should we reach you?",
          validate: function (d) { return S.isEmail(d && d.email); }
        },
        {
          id: "review",
          title: "Review your cart",
          validate: function (d) { return !!(d && d.confirmed); }
        },
        { id: "done", title: "That is all" }
      ];
    },

    /** Subscribe to vini exactly once per page load. */
    init: function () {
      if (this._inited) { this.ensure(); return this; }
      if (!window.vini || !window.vini.define) return this;
      this.ensure();
      var self = this;
      window.vini.on("start", function (e) {
        var wf = wfOf(e); if (wf) { self.paintStep(wf); self.open(); }
      });
      window.vini.on("step", function (e) {
        var wf = wfOf(e); if (wf) self.paintStep(wf);
      });
      window.vini.on("continue", function (e) {
        var wf = wfOf(e); if (wf) self.paintStep(wf);
      });
      window.vini.on("resume", function (e) {
        var wf = wfOf(e); if (wf) { self.paintStep(wf); self.open(); }
      });
      window.vini.on("pause", function () { self.close(); });
      window.vini.on("end", function () { self.close(); });
      window.vini.on("complete", function (e) { self.onComplete(wfOf(e)); });
      window.vini.on("error", function (e) { self.onError(e); });
      this._inited = true;
      return this;
    },

    /** Create the workflow, or repair a restored one in place. */
    ensure: function () {
      if (!window.vini || !window.vini.define || !window.vini.get) return null;
      var wf = window.vini.get(this.wfId);
      if (!wf) {
        window.vini.define(this.wfId, { id: this.wfId, label: "Checkout", steps: this._steps() });
        return window.vini.get(this.wfId);
      }
      // JSON round-tripping through localStorage dropped the step titles and
      // the validate() callbacks. Re-attach them while keeping `current` and
      // `data`, so a reload resumes instead of silently skipping validation.
      var defs = this._steps();
      var steps = Array.isArray(wf.steps) ? wf.steps : [];
      defs.forEach(function (def, i) {
        var step = steps[i];
        if (!step) {
          step = { id: def.id, title: def.title, action: "", data: null, completed_at: null };
          steps.push(step);
        }
        step.title = def.title;
        step.validate = def.validate || null;
      });
      wf.steps = steps;
      if (!(wf.current >= 0) || wf.current > steps.length - 1) wf.current = 0;
      return wf;
    },

    reset: function () {
      if (window.vini && window.vini.remove) window.vini.remove(this.wfId);
      this.clearDraft();
      return this.ensure();
    },

    /** Begin (or pick back up) a checkout. */
    start: function () {
      this.init();
      if (!window.vini) { toast("Checkout needs the platform workflow engine."); return; }
      if (!cart.count()) { toast("Your cart is empty."); return; }
      var wf = this.ensure();
      if (!wf) { toast("Checkout is unavailable right now."); return; }
      if (wf.status === "done" || wf.status === "ended") {
        wf = this.reset();
        if (!wf) { toast("Checkout is unavailable right now."); return; }
      }
      if (wf.status === "paused") { window.vini.resume(this.wfId); return; }
      if (wf.status === "running" && wf.current > 0) {
        this.paintStep(wf);
        this.open();
        return;
      }
      var data = {};
      cart._items.forEach(function (i) { data[i.id] = i.qty; });
      window.vini.start(this.wfId, data);
    },

    /** Reopen a checkout that was left half-finished (reload / back button). */
    restore: function () {
      if (!window.vini || !window.vini.get) return;
      var wf = window.vini.get(this.wfId);
      if (!wf) return;
      if (wf.status === "running" || wf.status === "paused") {
        if (!cart.count()) { this.reset(); return; }
        if (wf.status === "paused") { window.vini.resume(this.wfId); return; }
        this.paintStep(wf);
        this.open();
      }
    },

    /** The visitor closed the modal: pause so the run stays coherent. */
    cancel: function () {
      var wf = window.vini && window.vini.get ? window.vini.get(this.wfId) : null;
      if (wf && wf.status === "running") window.vini.pause(this.wfId);
      else this.close();
    },

    /** Advance the workflow, validating the current step first. */
    advance: function () {
      if (!window.vini || !window.vini.get) return;
      var wf = window.vini.get(this.wfId);
      if (!wf) return;
      if (wf.status === "paused") { window.vini.resume(this.wfId); return; }
      if (wf.status !== "running") return;
      var steps = wf.steps || [];
      var step = steps[Math.min(wf.current, steps.length - 1)];
      if (!step) return;
      if (step.id === "contact") {
        var input = qs("#wf-email");
        var email = input ? input.value.trim() : "";
        if (!S.isEmail(email)) {
          this.fieldError("Enter a valid email address, for example you@example.com.");
          return;
        }
        this.fieldError("");
        this.saveDraft({ email: email });
        window.vini.continue(this.wfId, { email: email });
      } else if (step.id === "review") {
        window.vini.continue(this.wfId, { confirmed: true });
      } else if (step.id === "done") {
        window.vini.complete(this.wfId);
      }
    },

    paintStep: function (wf) {
      var box = qs("#checkout-modal");
      if (!box || !wf) return;
      var steps = wf.steps || [];
      if (!steps.length) return;
      var idx = Math.max(0, Math.min(wf.current, steps.length - 1));
      var step = steps[idx];
      var total = steps.length;
      var self = this;

      var bar = qs("#wf-progress-bar");
      if (bar) bar.style.width = Math.round((idx / Math.max(total - 1, 1)) * 100) + "%";

      var list = qs(".steps", box);
      if (list) {
        clear(list);
        steps.forEach(function (s, i) {
          var mark = i < idx ? "\u2713" : i === idx ? "\u2022" : "\u00B7";
          list.appendChild(el("div", { class: "step" + (i === idx ? " current" : "") }, [
            el("span", { class: "mark", text: mark }),
            el("span", { text: s.title || s.id })
          ]));
        });
      }

      var head = qs(".wf-head", box);
      var body = qs(".wf-body", box);
      if (!body) return;
      clear(body);

      if (step.id === "contact") {
        if (head) head.textContent = "Step " + (idx + 1) + " of " + total + ": " + (step.title || "Contact");
        var input = el("input", {
          id: "wf-email", type: "email", name: "email", required: "required",
          autocomplete: "email", placeholder: "you@example.com",
          "aria-describedby": "wf-email-error",
          value: (step.data && step.data.email) || this.draft().email || ""
        });
        body.appendChild(el("label", { class: "wf-label", for: "wf-email" }, ["Email address"]));
        body.appendChild(input);
        body.appendChild(el("p", { class: "muted small", id: "wf-email-error", role: "alert" }));
        body.appendChild(el("p", { class: "muted small" }, [
          "This address is not sent anywhere. It is kept in this browser so the demo can resume."
        ]));
        input.addEventListener("input", function () { self.fieldError(""); self.saveDraft({ email: input.value }); });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); self.advance(); }
        });
      } else if (step.id === "review") {
        if (head) head.textContent = "Step " + (idx + 1) + " of " + total + ": Review your cart";
        body.appendChild(el("p", {
          text: "Nothing here is a purchase: no payment is taken and no order is placed."
        }));
        var summary = el("div", { class: "wf-summary" });
        body.appendChild(summary);
        var map = productsByIdCache._c;
        if (!map) {
          // The catalogue has not resolved yet (the visitor can reach the
          // review step before the cart finished loading). Show a placeholder
          // and repaint this step when the data lands.
          summary.appendChild(el("p", { class: "muted", text: "Loading the catalogue…" }));
          if (!this._loadingReview) {
            this._loadingReview = true;
            productsByIdCache().then(function () {
              self._loadingReview = false;
              var cur = window.vini.get(self.wfId);
              if (cur && cur.current === idx) self.paintStep(cur);
            }).catch(function () {
              self._loadingReview = false;
              var cur = window.vini.get(self.wfId);
              if (cur && cur.current === idx) self.paintStep(cur);
            });
          }
        } else {
          var lines = cart.lines(map);
          if (!lines.length) {
            summary.appendChild(el("p", { class: "muted", text: "Your cart is empty." }));
          }
          lines.forEach(function (l) {
            summary.appendChild(el("p", {
              text: l.product.name + " × " + l.qty + " — " + money(parseFloat(l.unit || 0) * l.qty)
            }));
          });
          summary.appendChild(el("p", {
            class: "cart-total",
            text: "Indicative total: " + money(cart.total(lines))
          }));
        }
      } else if (step.id === "done") {
        if (head) head.textContent = "That is all";
        body.appendChild(el("p", {
          text: "The demonstration workflow has finished. No payment was taken, no order was "
              + "created, and nothing was sent to Azzurro."
        }));
        body.appendChild(el("p", { class: "muted" }, [
          "To buy, email " + CONTACT_EMAIL + " with the items you want and we will send a quote."
        ]));
        body.appendChild(el("a", {
          class: "btn",
          href: "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent("Enquiry from azzurro.tech"),
          text: "Email us instead"
        }));
      }

      var btn = qs(".wf-advance", box);
      if (btn) {
        btn.disabled = false;
        if (step.id === "review") btn.textContent = "Confirm (no payment)";
        else if (step.id === "done") btn.textContent = "Close";
        else btn.textContent = "Continue";
      }
    },

    onComplete: function (wf) {
      this.close();
      this.clearDraft();
      cart.clear();
      toast("Demo checkout finished — no order was placed.");
      var btn = qs("#checkout-btn");
      if (btn) btn.disabled = true;
      // Leave no finished run behind, so the next cart starts clean.
      if (window.vini && window.vini.remove) {
        window.vini.remove(this.wfId);
        this.ensure();
      }
      return wf;
    },

    onError: function (e) {
      var step = e && e.detail ? e.detail.step : null;
      if (step && step.id === "contact") {
        this.fieldError("Enter a valid email address, for example you@example.com.");
        return;
      }
      toast("Please complete the highlighted step.");
    },

    fieldError: function (message) {
      var note = qs("#wf-email-error");
      var input = qs("#wf-email");
      if (note) note.textContent = message || "";
      if (input) {
        if (message) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    },

    /* The draft never leaves the browser: it exists so a reload does not lose
     * what the visitor typed while demonstrating the resume behaviour. */
    draft: function () {
      try {
        var raw = window.sessionStorage.getItem(this.draftKey);
        return raw ? JSON.parse(raw) || {} : {};
      } catch (e) { return {}; }
    },
    saveDraft: function (patch) {
      try {
        var next = this.draft();
        Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
        window.sessionStorage.setItem(this.draftKey, JSON.stringify(next));
      } catch (e) { /* private mode: the workflow still works, just not resumable */ }
    },
    clearDraft: function () {
      try { window.sessionStorage.removeItem(this.draftKey); } catch (e) { /* ignore */ }
    },

    open: function () {
      var m = qs("#checkout-modal");
      if (!m) return;
      m.classList.add("open");
      m.removeAttribute("aria-hidden");
      var input = qs("#wf-email");
      if (input) input.focus();
    },
    close: function () {
      var m = qs("#checkout-modal");
      if (!m) return;
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    }
  };

  /** wfOf — a vini event is a CustomEvent; the workflow lives in its detail. */
  function wfOf(event) {
    if (!event) return null;
    if (event.detail && event.detail.workflow) return event.detail.workflow;
    if (event.workflow) return event.workflow;
    // Tolerate a build that hands the workflow over directly.
    if (Array.isArray(event.steps) && event.current != null) return event;
    return null;
  }

  function wireCheckoutModal() {
    var modal = qs("#checkout-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("open")) checkout.cancel();
    });
    // Clicking the backdrop (not the card) cancels, like the Cancel button.
    modal.addEventListener("click", function (e) {
      if (e.target === modal) checkout.cancel();
    });
  }

  /* ---- vidi: posts listing ------------------------------------------------- */

  function pagePostsVidi() {
    var searchBtn = qs("#posts-search-btn");
    var searchInput = qs("#posts-search");
    if (searchBtn && searchInput) {
      var go = function () {
        var v = searchInput.value.trim();
        window.location.href = "search.html?q=" + encodeURIComponent(v);
      };
      searchBtn.addEventListener("click", go);
      searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    }
    if (!window.Vidi) { renderPostsFallback(); return; }
    try {
      new window.Vidi({
        dataSource: DATA + "/posts?limit=100",
        container: "#vidi-cards-container",
        pagination: "#vidi-pagination",
        pageSize: 6,
        titleField: "title",
        onRender: function (rows, container) {
          // Keep vidi as the data engine (fetch, ingest, pager); render the
          // current page slice with the site's az-post-card elements so the
          // cards link to post.html and match the site design.
          clear(container);
          var start = this.page * this.pageSize;
          sortBy(rows, "date", true).slice(start, start + this.pageSize)
            .forEach(function (post) {
              var card = document.createElement("az-post-card");
              card.post = post;
              container.appendChild(card);
            });
        },
        onError: function () {
          unavailable(qs("#vidi-cards-container"), "Posts are not available right now.");
        }
      });
    } catch (e) {
      renderPostsFallback();
    }
  }

  function renderPostsFallback() {
    var grid = qs("#vidi-cards-container");
    if (!grid) return;
    fetchTable("posts")
      .then(function (rows) { renderPostCards(grid, sortBy(rows, "date", true), 100); })
      .catch(function () { unavailable(grid, "Posts are not available right now."); });
  }

  /* ---- post article -------------------------------------------------------- */

  function pagePost() {
    var slug = params().get("slug");
    var box = qs("#post-article");
    if (!box) return;
    fetchTable("posts")
      .then(function (rows) {
        var post = byId(rows, slug);
        if (!post) { unavailable(box, "Post not found."); return; }
        var crumb = qs("#crumb-title");
        if (crumb) crumb.textContent = post.title || "Article";
        document.title = (post.title || "Article") + " — Azzurro Technology inc.";

        clear(box);
        box.appendChild(el("p", {
          class: "meta",
          text: (post.category || "Article") + " · " + fmtDate(post.date)
        }));
        box.appendChild(el("h1", { text: post.title || "" }));
        if (post.excerpt) box.appendChild(el("p", { class: "lede", text: post.excerpt }));
        if (post.body) {
          // Untrusted pod content: sanitised into a data tree, then built as
          // real DOM nodes. No HTML parser is used on this path.
          var body = el("div", { class: "body" });
          appendTree(body, S.parseRichText(post.body).root.children);
          box.appendChild(body);
        } else {
          box.appendChild(el("p", { class: "muted", text: "This article has no body text yet." }));
        }
        box.appendChild(el("p", {}, [el("a", { href: "posts.html", text: "\u2190 All posts" })]));
      })
      .catch(function () { unavailable(box, "Post is not available right now."); });
  }

  /* ---- search --------------------------------------------------------------- */

  function pageSearch() {
    var input = qs("#search-input");
    var btn = qs("#search-btn");
    var results = qs("#search-results");
    if (!results) return;
    if (btn && input) {
      btn.addEventListener("click", function () {
        var v = input.value.trim();
        if (v) window.location.href = "search.html?q=" + encodeURIComponent(v);
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    }
    var q = params().get("q") || "";
    if (input) input.value = q;
    if (!q) {
      results.appendChild(el("p", {
        class: "muted",
        text: "Type a query above, or use the search box on the posts page."
      }));
      return;
    }
    var needle = q.toLowerCase();
    Promise.all([fetchTable("products"), fetchTable("posts")])
      .then(function (both) {
        var products = both[0], posts = both[1];
        var hitP = products.filter(function (p) {
          return [p.name, p.short, p.description].join(" ").toLowerCase().indexOf(needle) !== -1;
        });
        var hitPosts = posts.filter(function (post) {
          return [post.title, post.excerpt, post.category, post.body]
            .join(" ").toLowerCase().indexOf(needle) !== -1;
        });
        clear(results);
        results.appendChild(el("h2", { text: "Products" }));
        renderProductCards(results.appendChild(el("div", { class: "cards" })), hitP, 100);
        results.appendChild(el("h2", { text: "Posts" }));
        renderPostCards(
          results.appendChild(el("div", { class: "cards" })),
          sortBy(hitPosts, "date", true),
          100
        );
        if (!hitP.length && !hitPosts.length) {
          results.appendChild(el("p", { class: "muted", text: "Nothing matched \u201C" + q + "\u201D." }));
        }
      })
      .catch(function () { unavailable(results, "Search is not available right now."); });
  }

  /* ---- boot ------------------------------------------------------------------ */

  function boot() {
    if (!S) return;
    cart.load();
    wireNav();
    defineComponents();
    wireCheckoutModal();
    var year = qs("#year");
    if (year) year.textContent = new Date().getFullYear();
    var page = document.body.getAttribute("data-page");
    if (page === "home") pageHome();
    else if (page === "shop") pageShop();
    else if (page === "product") pageProduct();
    else if (page === "cart") cartPage();
    else if (page === "posts") pagePostsVidi();
    else if (page === "post") pagePost();
    else if (page === "search") pageSearch();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
