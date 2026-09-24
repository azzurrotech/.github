# AzzurroTech — .github (org profile + azzurro.tech)

This repository holds the Azzurro Technology GitHub org profile and the
www.azzurro.tech website:

```
azzurrotech/.github
├── profile/README.md       # the azzurrotech GitHub org special README
├── azzurro.tech/           # the 1:1 replacement of https://www.azzurro.tech
│   ├── *.html              # 11 pages (home, shop, product, cart, posts, …)
│   ├── app.js              # application layer (veni/vidi/vici/vini)
│   ├── styles.css          # vanilla CSS, mirrors the live palette
│   ├── data/*.json         # seed content for the pod tables
│   └── legacy/             # parked superseded artifacts (do not use)
├── deploy.sh               # pushes seed data + site into the platform
├── Caddyfile               # edge routing: azzurro.tech → platform
└── website/Dockerfile      # local static preview only (see its header)
```

## Architecture

The website is **a client of the stenella platform** (it no longer bundles any
services):

- **Content** lives in pod tables for the `azzurrotech` client
  (`azzurrotech/products`, `azzurrotech/posts`) and is fetched at runtime from
  stenella's public site-data endpoint `/s/data/azzurrotech/…`.
- **Static files** (this site) live in the `azzurrotech` song silo and are
  served both on the mapped hosts (`--host-site azzurro.tech=azzurrotech`) and
  at `/c/azzurrotech/…` on the platform host.
- **JS libraries** (veni/vidi/vici/vini) are loaded from the platform's
  canonical copies at `/s/static/lib/*.js` — never duplicated in this repo.
- `azzurro.tech/platform` 308-redirects to the platform portal
  `/s/portal?client=azzurrotech`.

## Deploy

```
ATP_URL=http://<atp-host>:8084 ATP_PASS=<admin-password> ./deploy.sh
```

or put `ATP_URL`/`ATP_USER`/`ATP_PASS` in a `./.env` file and run
`./deploy.sh`. Deploys are idempotent: records carry stable ids (upsert) and
files are uploaded with `overwrite=true`.

Then run the platform (stenella repo) with the host mapping:

```
./stenella --host-site azzurro.tech=azzurrotech \
           --host-site www.azzurro.tech=azzurrotech
```

and route the domain through Caddy (`caddy run --config Caddyfile`).

## Notes

- The old integration-stack scripts, logs and fix documents (`start_*.sh`,
  `*_FIX.md`, `logs/`, `integration-framework/`, zip archives, the
  `` ```shepherd ``` `Dockerfile` folder) are historical cleanup targets —
  see the workspace `AGENTS.md` §7. They are parked in git history and are not
  part of any build.
- © Azzurro Technology Inc. — MIT.