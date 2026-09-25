# azzurro.tech — the Azzurro Technology website

A 1:1 replacement of the public features of https://www.azzurro.tech, built as
a **client of the stenella platform**:

| Live-site feature | How it is replicated here |
|---|---|
| Homepage + CTAs (booking, GitHub, LinkedIn, shop, posts) | `index.html` |
| Shop: 5 products with sale badges/prices | pod table `azzurrotech/products` → `shop.html`, `product.html` |
| Cart / checkout | vici-backed cookie cart + vini **local demonstration** workflow (`cart.html`, `checkout.html` → cart) |
| Posts + search | pod table `azzurrotech/posts` → `posts.html` (rendered by **vidi**), `post.html`, `search.html` |
| My account | `my-account.html` → the platform portal (`/s/portal?client=azzurrotech`) |
| Privacy policy / Terms (refund_returns) | static pages with verbatim live copy |
| RSS / Atom feeds | stenella combined feed: `/s/feed/azzurrotech/combined.xml` / `.atom` |
| oEmbed / wp-json | platform gap (documented in the end-to-end review); feeds supersede them |

**Bulk Upload Ready**: All site files are structured for streamlined bulk upload via Stenella's batch upload API. The deployment process prioritizes atomic file transfers, with automatic path normalization to maintain consistent file organization. Binary and text files are handled through streamlined, efficient upload mechanisms that reduce the complexity of deploying site updates.

## Stack

- **No frameworks.** Vanilla HTML5/CSS/ES6 JS. The only JS libraries are the
  Emperor42 set, loaded from the platform's canonical copies:
  `veni` (custom elements `az-product-card` / `az-post-card`), `vidi` (posts
  listing + paging), `vici` (cookie-backed cart, `azzurro_cart`), `vini`
  (checkout workflow, persisted under `vini_workflows`).
- Content is **not** served by a local CMS — it lives in pod tables and is
  fetched at runtime from `/s/data/azzurrotech/products` and
  `/s/data/azzurrotech/posts`. `data/*.json` are the **seed files** replayed by
  [`deploy.sh`](../deploy.sh).
- All `document.cookie` access goes through `vici`; `safe.js` validates URLs and
  converts article markup to a constrained node tree. No pod-controlled value
  is assigned to `innerHTML`.

## Pages

`index.html` · `shop.html` · `product.html?slug=…` · `cart.html` ·
`checkout.html` (alias → cart) · `posts.html` · `post.html?slug=…` ·
`search.html?q=…` · `my-account.html` · `privacy-policy.html` ·
`refund_returns.html`.

## Serving

The site files live in the `azzurrotech` song silo on the platform and are
served at `/c/azzurrotech/…`, plus on the mapped hosts (`--host-site
azzurro.tech=azzurrotech`). See the repo-root `README.md` and [`deploy.sh`](../deploy.sh).

## Local preview (design only)

```
docker build -f ../website/Dockerfile -t azzurro-preview .
docker run --rm -p 8000:80 azzurro-preview
```
Products/posts will not load without the platform (`/s/data`, `/s/static/lib`).

`legacy/` parks superseded artifacts (stale veni/vidi/vici/vini copies, the old
`vini-integration.js`, and previous implementation plans).

## What this deployment does not provide

- Checkout is a browser-local VINI demonstration. It does not capture payment,
  create a server-side order, issue an invoice, or send the email entered in
  the workflow. A real purchase requires a separate server-side order/payment
  implementation and a quote or invoice process.
- The “My Account” page links to the client portal for site/content/platform
  configuration; it is not a WordPress/WooCommerce consumer account or order
  history system.
- WordPress `wp-json`, WooCommerce APIs, and oEmbed are not implemented. The
  supported public content surfaces are pod JSON, RSS/Atom, and the combined
  feed JSON endpoint.
- The privacy and terms pages preserve published legal text, but their account,
  payment, comment, and media-upload descriptions are not claims that this
  static deployment currently implements those systems.