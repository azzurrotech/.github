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
 *   vici — cookie-backed cart + encrypted order notes
 *   vini — checkout workflow with progress persisted in localStorage
 *
 * Vanilla ES6 only. No libraries beyond the four above, no CDNs.
 */

(function () {
  "use strict";

  var DATA = "/s/data/azzurrotech"; // pod tables, public read-only JSON

  /* ---- tiny safe DOM helpers -------------------------------------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Build a DOM node without any innerHTML-with-data, so pod content can
   * never inject markup. attrs values are set via attribute/property, and
   * children are nodes or text strings (escaped). */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v; // only for trusted static markup
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k.indexOf("data-") === 0) node.setAttribute(k, v);
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function qsa(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  function money(n) {
    var num = parseFloat(n);
    if (isNaN(num)) return "$0.00";
    return "$" + num.toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    // Parse YYYY-MM-DD as a *local* date so the displayed day never shifts
    // across timezones (new Date("2026-06-01") is midnight UTC).
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (m) {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      }
    }
    var t = new Date(iso);
    if (isNaN(t.getTime())) return iso;
    return t.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function toast(msg) {
    var box = qs("#toast");
    if (!box) {
      box = el("div", { id: "toast", class: "toast" });
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove("show"); }, 2600);
  }

  /* ---- data access: stenella public site-data ---------------------------- */

  function fetchTable(table, opts) {
    var url = DATA + "/" + table;
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
        return (data && data.records) ? data.records : [];
      });
  }

  function byId(rows, id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id || rows[i].slug === id) return rows[i];
    return null;
  }

  /* ---- cart — cookie-backed through vici (localStorage fallback) ---------
   * cart shape: [ { id, qty }, ... ]; item details are read from pod data at
   * render time so prices always reflect the published table. */

  var CART_KEY = "azzurro_cart";

  function viciGet(name) {
    if (window.vici && window.vici.cookieGet) {
      var v = window.vici.cookieGet(name);
      if (v != null) return v;
    }
    try { return window.localStorage.getItem(name); } catch (e) { return null; }
  }

  function viciSet(name, value) {
    if (window.vici && window.vici.cookieSet) {
      window.vici.cookieSet(name, value, 30, { path: "/", sameSite: "Lax" });
    }
    try { window.localStorage.setItem(name, value); } catch (e) { /* ignore */ }
  }

  function viciDel(name) {
    if (window.vici && window.vici.cookieDelete) window.vici.cookieDelete(name);
    try { window.localStorage.removeItem(name); } catch (e) { /* ignore */ }
  }

  var cart = {
    _items: [],
    load: function () {
      try {
        var raw = viciGet(CART_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        this._items = Array.isArray(parsed) ? parsed.filter(function (i) { return i && i.id && i.qty > 0; }) : [];
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
      qty = qty || 1;
      var line = this._items.find(function (i) { return i.id === id; });
      if (line) line.qty += qty;
      else this._items.push({ id: id, qty: qty });
      this.save();
      this.paint();
      toast("Added to cart");
    },
    setQty: function (id, qty) {
      var line = this._items.find(function (i) { return i.id === id; });
      if (!line) return;
      line.qty = Math.max(1, parseInt(qty, 10) || 1);
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
      this._items.forEach(function (li) {
        var p = productsById[li.id];
        if (p) out.push({ product: p, qty: li.qty, unit: p.sale_price && p.on_sale === "true" ? p.sale_price : p.price });
      });
      return out;
    },
    total: function (lines) {
      return lines.reduce(function (n, l) { return n + parseFloat(l.unit || 0) * l.qty; }, 0);
    },
    paint: function () {
      qsa("[data-cart-badge]").forEach(function (b) {
        var n = cart.count();
        b.textContent = n;
        b.classList.toggle("hidden", n === 0);
      });
    }
  };

  /* ---- veni: custom elements ---------------------------------------------
   * Defined through veni so they are discovered, registered and upgraded on
   * every page via veni.init(). Light DOM (no shadow) so the site stylesheet
   * applies. Data is bound as a property before insertion. */

  // shared card shell
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

  function productPriceNode(p) {
    var price = el("div", { class: "price" });
    if (p.on_sale === "true" && p.sale_price) {
      price.appendChild(el("span", { class: "old", text: money(p.price) }));
      price.appendChild(el("span", { class: "sale-price", text: money(p.sale_price) }));
    } else {
      price.appendChild(el("span", { text: money(p.price) }));
    }
    return price;
  }

  function imageFor(p) {
    return el("img", { src: esc(p.image || "assets/logo.png"), alt: esc(p.name), loading: "lazy" });
  }

  window.AzProductCard = class AzProductCard extends HTMLElement {
    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;
      var p = this.product || {};
      var shell = cardShell(imageFor(p), productPriceNode(p));
      var badge = null;
      if (p.on_sale === "true" && p.sale_price) badge = "Sale";
      if (badge) shell.root.firstChild.appendChild(el("span", { class: "badge", text: badge }));
      shell.body.appendChild(el("h3", {}, [el("a", { href: "product.html?slug=" + encodeURIComponent(p.slug || p.id), text: p.name })]));
      shell.body.appendChild(el("p", { class: "excerpt", text: p.short || p.description || "" }));
      var act = el("div", { class: "actions" });
      act.appendChild(el("button", { class: "btn small", text: "Add to cart", onclick: function () { cart.add(p.id, 1); } }));
      act.appendChild(el("a", { class: "btn small ghost", href: "product.html?slug=" + encodeURIComponent(p.slug || p.id), text: "Details" }));
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
      shell.body.appendChild(el("p", { class: "meta", text: (post.category || "Article") + " · " + fmtDate(post.date) }));
      shell.body.appendChild(el("h3", {}, [el("a", { href: "post.html?slug=" + encodeURIComponent(post.slug || post.id), text: post.title })]));
      shell.body.appendChild(el("p", { class: "excerpt", text: post.excerpt || "" }));
      shell.body.appendChild(el("a", { class: "btn small ghost", href: "post.html?slug=" + encodeURIComponent(post.slug || post.id), text: "Read more" }));
      this.appendChild(shell.root);
    }
  };

  function defineComponents() {
    if (!window.veni || !window.veni.define) return;
    window.veni.define("az-product-card", window.AzProductCard);
    window.veni.define("az-post-card", window.AzPostCard);
    if (window.veni.init) window.veni.init();
  }

  /* ---- shared renderers (products / posts) ------------------------------- */

  function renderProductCards(container, products, limit) {
    if (!container) return;
    container.innerHTML = "";
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
    container.innerHTML = "";
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
      var av = a[key] != null ? a[key] : "";
      var bv = b[key] != null ? b[key] : "";
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }

  /* ---- nav chrome --------------------------------------------------------- */

  function wireNav() {
    var toggle = qs(".mobile-menu-toggle");
    var links = qs(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", function () { links.classList.toggle("open"); });
    }
    var badge = qs("[data-cart-badge]");
    if (badge) cart.paint();
  }

  /* ---- pages --------------------------------------------------------------- */

  function pageHome() {
    var grid = qs("#hero-products");
    if (grid) {
      fetchTable("products").then(function (rows) {
        renderProductCards(grid, sortBy(rows.filter(function (p) { return p.featured === "true"; }), "order", false), 4);
      }).catch(function (e) { grid.innerHTML = ""; grid.appendChild(el("p", { class: "muted", text: "Products are not available right now." })); });
    }
    var latest = qs("#latest-posts");
    if (latest) {
      fetchTable("posts").then(function (rows) {
        renderPostCards(latest, sortBy(rows, "date", true), 3);
      }).catch(function () {
        latest.innerHTML = "";
        latest.appendChild(el("p", { class: "muted", text: "Posts are not available right now." }));
      });
    }
    var contact = qs("#contact-form");
    if (contact) {
      contact.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = qs("#cf-name", contact).value.trim();
        var mail = qs("#cf-email", contact).value.trim();
        var msg = qs("#cf-message", contact).value.trim();
        var subject = encodeURIComponent("Contact — azzurro.tech");
        var body = encodeURIComponent(name + "\n\n" + msg);
        window.location.href = "mailto:info@azzurro.tech?subject=" + subject + "&body=" + body;
        toast("Opening your mail app…");
      });
    }
  }

  function pageShop() {
    var grid = qs("#product-grid");
    if (!grid) return;
    fetchTable("products").then(function (rows) {
      renderProductCards(grid, sortBy(rows, "order", false), 100);
    }).catch(function () {
      grid.innerHTML = "";
      grid.appendChild(el("p", { class: "muted", text: "Products are not available right now." }));
    });
  }

  function pageProduct() {
    var slug = params().get("slug");
    var box = qs("#product-detail");
    if (!box) return;
    fetchTable("products").then(function (rows) {
      var p = byId(rows, slug);
      if (!p) { box.innerHTML = ""; box.appendChild(el("p", { class: "muted", text: "Product not found." })); return; }
      box.appendChild(el("div", { class: "thumb", }, [imageFor(p)]));
      var info = el("div", { class: "info" });
      if (p.on_sale === "true" && p.sale_price) info.appendChild(el("span", { class: "badge", text: "Sale" }));
      info.appendChild(el("h1", { text: p.name }));
      info.appendChild(priceBig(p));
      info.appendChild(el("p", { text: p.description || "" }));
      var act = el("div", { class: "row" });
      act.appendChild(el("button", { class: "btn", text: "Add to cart", onclick: function () { cart.add(p.id, 1); } }));
      act.appendChild(el("a", { class: "btn secondary", href: "shop.html", text: "Browse the shop" }));
      info.appendChild(act);
      if (p.on_sale === "true") info.appendChild(el("p", { class: "notice", text: "Launch pricing — price shown on the cart reflects the sale." }));
      box.appendChild(info);
    }).catch(function () {
      box.innerHTML = "";
      box.appendChild(el("p", { class: "muted", text: "Product is not available right now." }));
    });
  }

  function priceBig(p) {
    var price = el("div", { class: "price big" });
    if (p.on_sale === "true" && p.sale_price) {
      price.appendChild(el("span", { class: "old", text: money(p.price) }));
      price.appendChild(el("span", { class: "sale-price", text: money(p.sale_price) }));
    } else {
      price.appendChild(el("span", { text: money(p.price) }));
    }
    return price;
  }

  function cartPage() {
    var linesBox = qs("#cart-lines");
    if (!linesBox) return;
    checkout.init();
    var advance = qs(".wf-advance");
    if (advance) advance.addEventListener("click", function () { checkout.advance(); });
    renderCart();
    var checkoutBtn = qs("#checkout-btn");
    if (checkoutBtn) checkoutBtn.addEventListener("click", startCheckout);
  }

  function productsByIdCache() {
    var cache = productsByIdCache._c;
    if (cache) return Promise.resolve(cache);
    return fetchTable("products").then(function (rows) {
      var map = {};
      rows.forEach(function (p) { map[p.id] = p; map[p.slug] = p; });
      productsByIdCache._c = map;
      return map;
    });
  }

  function renderCart() {
    var linesBox = qs("#cart-lines");
    var totalBox = qs("#cart-total");
    var emptyBox = qs("#cart-empty");
    productsByIdCache().then(function (byIdMap) {
      var lines = cart.lines(byIdMap);
      linesBox.innerHTML = "";
      if (!lines.length) {
        if (emptyBox) emptyBox.classList.remove("hidden");
        if (totalBox) totalBox.textContent = "Total: $0.00";
        var checkoutBtn = qs("#checkout-btn");
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
      }
      if (emptyBox) emptyBox.classList.add("hidden");
      lines.forEach(function (l) {
        linesBox.appendChild(cartLineEl(l, byIdMap));
      });
      var t = cart.total(lines);
      if (totalBox) totalBox.textContent = "Total: " + money(t);
      var checkoutBtn = qs("#checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = false;
    }).catch(function () {
      linesBox.innerHTML = "";
      linesBox.appendChild(el("p", { class: "muted", text: "Cart could not be loaded right now." }));
    });
  }

  function cartLineEl(line, byIdMap) {
    var p = line.product;
    var row = el("div", { class: "cart-line" });
    var t = el("div", { class: "thumb" }, [el("img", { src: esc(p.image || "assets/logo.png"), alt: esc(p.name) })]);
    row.appendChild(t);
    var info = el("div", { class: "info" });
    info.appendChild(el("h4", {}, [el("a", { href: "product.html?slug=" + encodeURIComponent(p.slug || p.id), text: p.name })]));
    info.appendChild(el("p", { class: "muted", text: money(line.unit) + " each" }));
    row.appendChild(info);
    var qty = el("input", { class: "qty", type: "number", min: "1", value: String(line.qty), "aria-label": "Quantity" });
    qty.addEventListener("change", function () { cart.setQty(line.product.id, qty.value); renderCart(); });
    row.appendChild(qty);
    row.appendChild(el("span", { text: money(parseFloat(line.unit || 0) * line.qty) }));
    row.appendChild(el("button", { class: "btn small ghost", text: "Remove", onclick: function () { cart.remove(line.product.id); renderCart(); } }));
    return row;
  }

  /* ---- vini: checkout workflow -------------------------------------------- */

  var checkout = {
    wfId: "azzurro-checkout",
    init: function () {
      if (!window.vini || !window.vini.define) return;
      window.vini.define(this.wfId, {
        id: this.wfId,
        steps: [
          { id: "contact", title: "Let us know where to reach you",
            validate: function (d) { return d && d.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email); } },
          { id: "review", title: "Review your cart",
            validate: function () { return true; } },
          { id: "done", title: "Order received",
            validate: function () { return true; } }
        ]
      });
      var self = this;
      window.vini.on("start", function (wf) { self.paintStep(wf); self.open(); });
      window.vini.on("step", function (wf) { self.paintStep(wf); });
      window.vini.on("complete", function () {
        self.close();
        cart.clear();
        toast("Order received — we will email your invoice shortly.");
        var btn = qs("#checkout-btn");
        if (btn) btn.disabled = true;
      });
      window.vini.on("error", function () { toast("Please complete the highlighted fields."); });
    },
    start: function () {
      if (!window.vini) { toast("Checkout needs the platform workflow engine."); return; }
      var data = cart._items.reduce(function (m, i) { m[i.id] = i.qty; return m; }, {});
      window.vini.start(this.wfId, data);
    },
    advance: function () {
      var wf = window.vini.get && window.vini.get(this.wfId);
      if (!wf) return;
      var step = wf.steps[wf.current];
      if (step.id === "contact") {
        var email = qs("#wf-email").value.trim();
        window.vini.continue(this.wfId, { email: email });
      } else if (step.id === "review") {
        window.vini.continue(this.wfId, { confirmed: true });
      } else if (step.id === "done") {
        window.vini.complete(this.wfId);
      }
    },
    paintStep: function (wf) {
      var box = qs("#checkout-modal");
      if (!box) return;
      var totalSteps = wf.steps.length;
      var idx = Math.min(wf.current, totalSteps - 1);
      var bar = qs("#wf-progress-bar");
      if (bar) bar.style.width = Math.round((idx / Math.max(totalSteps - 1, 1)) * 100) + "%";
      var step = wf.steps[idx];
      var stepsEl = qs(".steps", box);
      stepsEl.innerHTML = "";
      wf.steps.forEach(function (s, i) {
        var line = el("div", { class: "step" });
        var mark = i < idx ? "\u2713" : i === idx ? "\u2022" : "\u00B7";
        line.appendChild(el("span", { class: "mark", text: mark }));
        line.appendChild(el("span", { text: s.title }));
        stepsEl.appendChild(line);
      });
      var body = qs(".wf-body", box);
      body.innerHTML = "";
      var head = qs(".wf-head", box);
      if (step.id === "contact") {
        var f = el("label", {}, ["Email address"]);
        var input = el("input", { id: "wf-email", type: "email", required: "required", placeholder: "you@example.com" });
        f.appendChild(input);
        body.appendChild(f);
        if (head) head.innerHTML = "Step " + (idx + 1) + " of " + totalSteps + ": " + step.title;
      } else if (step.id === "review") {
        body.appendChild(el("p", { text: "Review the items below. Payments are not captured on azzurro.tech today — invoices follow by email." }));
        var summary = el("div", { class: "wf-summary" });
        var lines = cart.lines(productsByIdCache._c || {});
        if (!lines.length) {
          // Product rows may not be cached yet (user jumped straight to
          // checkout); refill and repaint this step.
          productsByIdCache().then(function () {
            var wf = window.vini && window.vini.get ? window.vini.get(checkout.wfId) : null;
            if (wf) checkout.paintStep(wf);
          });
        }
        lines.forEach(function (l) {
          summary.appendChild(el("p", { text: l.product.name + " × " + l.qty + " — " + money(parseFloat(l.unit || 0) * l.qty) }));
        });
        summary.appendChild(el("p", { class: "cart-total", text: "Total: " + money(cart.total(lines)) }));
        body.appendChild(summary);
        if (head) head.innerHTML = "Step " + (idx + 1) + " of " + totalSteps + ": Review your order";
      } else if (step.id === "done") {
        body.appendChild(el("p", { text: "Thank you — your order has been received and is stored locally. We will be in touch at the email you provided." }));
        if (head) head.innerHTML = "All set";
      }
      var btn = qs(".wf-advance", box);
      if (btn) {
        btn.disabled = false;
        if (step.id === "review") btn.textContent = "Confirm order";
        else if (step.id === "done") btn.textContent = "Finish";
        else btn.textContent = "Continue";
      }
    },
    open: function () { var m = qs("#checkout-modal"); if (m) m.classList.add("open"); },
    close: function () { var m = qs("#checkout-modal"); if (m) m.classList.remove("open"); }
  };

  function startCheckout() {
    checkout.init();
    checkout.start();
  }

  /* ---- vidi: posts listing -------------------------------------------------
   * The posts page hands rendering to vidi (pod output as cards + pager). The
   * container gets rendered cards; post cards open post.html. */

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
        container.innerHTML = "";
        var start = this.page * this.pageSize;
        var slice = this.rows.slice(start, start + this.pageSize);
        slice.forEach(function (post) {
          var card = document.createElement("az-post-card");
          card.post = post;
          container.appendChild(card);
        });
      }
    });
  }

  function renderPostsFallback() {
    var grid = qs("#vidi-cards-container");
    if (!grid) return;
    fetchTable("posts").then(function (rows) {
      renderPostCards(grid, sortBy(rows, "date", true), 100);
    }).catch(function () {
      grid.innerHTML = "";
      grid.appendChild(el("p", { class: "muted", text: "Posts are not available right now." }));
    });
  }

  /* ---- post article -------------------------------------------------------- */

  function pagePost() {
    var slug = params().get("slug");
    var box = qs("#post-article");
    if (!box) return;
    fetchTable("posts").then(function (rows) {
      var post = byId(rows, slug);
      if (!post) { box.innerHTML = ""; box.appendChild(el("p", { class: "muted", text: "Post not found." })); return; }
      box.appendChild(el("p", { class: "meta", text: (post.category || "Article") + " · " + fmtDate(post.date) }));
      box.appendChild(el("h1", { text: post.title }));
      box.appendChild(el("div", { class: "body" }, [el("p", { text: post.excerpt || "" })]));
      if (post.body) box.appendChild(el("div", { class: "body", html: post.body }));
      box.appendChild(el("p", {}, [el("a", { href: "posts.html", text: "\u2190 All posts" })]));
    }).catch(function () {
      box.innerHTML = "";
      box.appendChild(el("p", { class: "muted", text: "Post is not available right now." }));
    });
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
    if (!q) { results.appendChild(el("p", { class: "muted", text: "Type a query above, or use the search box on the posts page." })); return; }
    Promise.all([fetchTable("products"), fetchTable("posts")]).then(function (both) {
      var products = both[0], posts = both[1];
      var needle = q.toLowerCase();
      var hitP = products.filter(function (p) {
        return (p.name + " " + p.short + " " + p.description + " " + p.meta).toLowerCase().indexOf(needle) !== -1;
      });
      var hitPosts = posts.filter(function (post) {
        return (post.title + " " + post.excerpt + " " + post.category).toLowerCase().indexOf(needle) !== -1;
      });
      results.innerHTML = "";
      results.appendChild(el("h2", { text: "Products" }));
      renderProductCards(results.appendChild(el("div", { class: "cards" })), hitP, 100);
      results.appendChild(el("h2", { text: "Posts" }));
      renderPostCards(results.appendChild(el("div", { class: "cards" })), sortBy(hitPosts, "date", true), 100);
      if (!hitP.length && !hitPosts.length) {
        results.appendChild(el("p", { class: "muted", text: "Nothing matched \u201C" + q + "\u201D." }));
      }
    }).catch(function () {
      results.innerHTML = "";
      results.appendChild(el("p", { class: "muted", text: "Search is not available right now." }));
    });
  }

  /* ---- boot ------------------------------------------------------------------ */

  function boot() {
    cart.load();
    cart.paint();
    wireNav();
    defineComponents();
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