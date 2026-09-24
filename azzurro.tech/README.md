# azzurro.tech — the Azzurro Technology website

A 1:1 replacement of the public features of https://www.azzurro.tech, built as
a **client of the stenella platform**:

| Live-site feature | How it is replicated here |
|---|---|
| Homepage + CTAs (booking, GitHub, LinkedIn, shop, posts) | `index.html` |
| Shop: 5 products with sale badges/prices | pod table `azzurrotech/products` → `shop.html`, `product.html` |
| Cart / checkout | vici-backed cookie cart + vini checkout workflow (`cart.html`, `checkout.html` → cart) |
| Posts + search | pod table `azzurrotech/posts` → `posts.html` (rendered by **vidi**), `post.html`, `search.html` |
| My account | `my-account.html` → the platform portal (`/s/portal?client=azzurrotech`) |
| Privacy policy / Terms (refund_returns) | static pages with verbatim live copy |
| RSS / Atom feeds | stenella combined feed: `/s/feed/azzurrotech/combined.xml` / `.atom` |
| oEmbed / wp-json | platform gap (documented in the end-to-end review); feeds supersede them |

## Stack

- **No frameworks.** Vanilla HTML5/CSS/ES6 JS. The only JS libraries are the
  Emperor42 set, loaded from the platform's canonical copies:
  `veni` (custom elements `az-product-card` / `az-post-card`), `vidi` (posts
  listing + paging), `vici` (cookie-backed cart, `azzurro_cart`), `vini`
  (checkout workflow, persisted under `vini_workflows`).
- Content is **not** in this repo — it lives in pod tables and is fetched at
  runtime from `/s/data/azzurrotech/products` and `/s/data/azzurrotech/posts`.
  `data/*.json` are the **seed files** replayed by [`deploy.sh`](../deploy.sh).
- All `document.cookie` access goes through `vici`; all card/article content is
  inserted via text nodes (escaped) — no raw HTML injection from pod data.

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