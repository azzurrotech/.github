#!/usr/bin/env bash
#
# deploy.sh — deploy the azzurro.tech 1:1 site to the stenella platform.
#
# The site is hosted as the "azzurrotech" client of the platform:
#   * pod tables  azzurrotech/products, azzurrotech/posts  ← data/products.json,
#     data/posts.json (each record carries a stable id → re-runs upsert, never
#     duplicate);
#   * the static site (HTML/CSS/JS/images) is uploaded to the song silo
#     azzurrotech, then served by stenella under the mapped host
#     (--host-site azzurro.tech=azzurrotech) and at /c/azzurrotech/.
#
# Requirements: curl + python3 (python3 is used only to build JSON payloads
# safely; no external tools).
#
# Configuration (environment or ./.env):
#   ATP_URL   atp base URL    (default http://localhost:8084)
#   ATP_USER  admin username  (default admin)
#   ATP_PASS  admin password  (required)
#
# Usage:
#   ATP_PASS=... ./deploy.sh            # seed content + upload files
#   ./deploy.sh --files-only            # only upload the static site
#   ./deploy.sh --data-only             # only (re)seed the pod tables
#
# After deploying, run stenella with:
#   ./stenella --host-site azzurro.tech=azzurrotech \
#              --host-site www.azzurro.tech=azzurrotech
# and verify:  curl -i http://<host>:8084/  (site) and
#              curl http://<host>:8084/s/data/azzurrotech/products
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$HERE/azzurro.tech"
CLIENT="azzurrotech"

DO_DATA=1
DO_FILES=1
for arg in "$@"; do
  case "$arg" in
    --files-only) DO_DATA=0 ;;
    --data-only)  DO_FILES=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [ -f "$HERE/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$HERE/.env"; set +a
fi

ATP_URL="${ATP_URL:-http://localhost:8084}"
ATP_USER="${ATP_USER:-admin}"
ATP_PASS="${ATP_PASS:-}"

if [ -z "$ATP_PASS" ]; then
  echo "error: ATP_PASS is required (set it in the environment or ./.env)" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required to build JSON payloads" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SM="$WORK/status"; BM="$WORK/body"; JAR="$WORK/cookies.txt"

say()  { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

status() { cat "$SM"; }
body()   { cat "$BM"; }

# call METHOD URL [JSON_DATA] — session-cookie admin call to $ATP_URL.
call() {
  local method="$1" url="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -o "$BM" -w '%{http_code}' -c "$JAR" -b "$JAR" \
      -X "$method" -H "Content-Type: application/json" --data-binary "$data" \
      "$ATP_URL$url" > "$SM"
  else
    curl -sS -o "$BM" -w '%{http_code}' -c "$JAR" -b "$JAR" \
      -X "$method" -H "Content-Type: application/json" \
      "$ATP_URL$url" > "$SM"
  fi
}

# expect CODES [WHAT] — assert the last call returned one of the codes
# (space-separated, e.g. "200 201"). Defaults to "200".
expect() {
  local want="${1:-200}" what="${2:-request}" code
  code="$(status)"
  case " $want " in
    *" $code "*) return 0 ;;
  esac
  die "$what failed (HTTP $code): $(body | head -c 400)"
}

# records FILE — print each JSON record from an array on its own line.
records() {
  python3 -c 'import json,sys
for r in json.load(open(sys.argv[1])):
    print(json.dumps(r, ensure_ascii=True))' "$1"
}

# columns_json "a b c" — a JSON array of text columns.
columns_json() {
  python3 -c 'import json,sys
print(json.dumps([{"name": n, "type": "text"} for n in sys.argv[1].split()]))' "$1"
}

quote_path() { # URL-encode a song path, keeping "/"
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$1"
}

file_json() { # {"path": rel, "content": <file contents>, "overwrite": true}
  python3 -c 'import json,sys
print(json.dumps({"path": sys.argv[1], "content": open(sys.argv[2], encoding="utf-8").read(), "overwrite": True}))' "$1" "$2"
}

is_binary() {
  case "$1" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.svg|*.woff|*.woff2|*.pdf) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------

say "Signing in to atp at $ATP_URL"
call POST /login "{\"user\":$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$ATP_USER"),\"password\":$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$ATP_PASS")}"
expect 200 "login (ATP_USER/ATP_PASS)"

say "Ensuring client '$CLIENT'"
call GET /api/clients
if ! grep -q "\"$CLIENT\"" "$BM"; then
  call POST /api/clients "{\"id\":\"$CLIENT\"}"
  expect "200 201" "create client"
  ok "client created"
else
  ok "client already exists"
fi

if [ "$DO_DATA" = 1 ]; then
  # --- pod tables + seed records -------------------------------------------
  products_columns="id name slug price sale_price on_sale short description image featured order"
  posts_columns="id title slug date category excerpt image featured order body"

  say "Seeding pod tables for client '$CLIENT'"
  call POST /api/pod/tables "{\"table\":\"$CLIENT/products\",\"columns\":$(columns_json "$products_columns")}"
  if [ "$(status)" = "200" ]; then ok "table products ready"; else warn "create table products: HTTP $(status) ($(body | head -c 160))"; fi
  call POST /api/pod/tables "{\"table\":\"$CLIENT/posts\",\"columns\":$(columns_json "$posts_columns")}"
  if [ "$(status)" = "200" ]; then ok "table posts ready"; else warn "create table posts: HTTP $(status) ($(body | head -c 160))"; fi

  upsert_table() {
    local table="$1" file="$2" n=0
    while IFS= read -r record; do
      [ -z "$record" ] && continue
      call POST "/api/pod/table/$CLIENT/$table" "$record"
      if [ "$(status)" != "200" ]; then
        warn "upsert $table failed (HTTP $(status)): $(body | head -c 200)"
        continue
      fi
      n=$((n + 1))
    done < <(records "$file")
    echo "$n"
  }

  n_products="$(upsert_table products "$SITE/data/products.json")"
  n_posts="$(upsert_table posts "$SITE/data/posts.json")"
  ok "$n_products products, $n_posts posts upserted (creates and updates by id)"
fi

if [ "$DO_FILES" = 1 ]; then
  # --- static site upload to the song silo ---------------------------------
  say "Uploading site files to silo '$CLIENT'"
  n_files=0
  while IFS= read -r -d '' abs; do
    rel="${abs#"$SITE"/}"
    # Skip legacy, data, README, and git directories
    if [[ "$rel" == legacy/* ]] 2>/dev/null ||
        [[ "$rel" == data/* ]] 2>/dev/null ||
        [[ "$rel" == README.md ]] 2>/dev/null ||
        [[ "$rel" == .git/* ]] 2>/dev/null ||
        [[ "$rel" == .git ]] 2>/dev/null; then
      continue
    fi
    if is_binary "$rel"; then
      curl -sS -o "$BM" -w '%{http_code}' -c "$JAR" -b "$JAR" \
        -X POST -H "Content-Type: application/octet-stream" \
        --data-binary "@$abs" \
        "$ATP_URL/api/song/silos/$CLIENT/file?path=$(quote_path "$rel")&overwrite=true" > "$SM" || die "upload failed for $rel"
    else
      call POST "/api/song/silos/$CLIENT/file" "$(file_json "$rel" "$abs")" || die "upload failed for $rel"
    fi
    if [ "$(status)" != "200" ] && [ "$(status)" != "201" ]; then
      warn "upload $rel failed (HTTP $(status)): $(body | head -c 200)"
      continue
    fi
    n_files=$((n_files + 1))
  done < <(cd "$SITE" && find . -type f -print0)
  ok "$n_files files uploaded"
fi

say "Done."
printf '\nVerify against a running stenella (host-mapped):\n'
printf '  curl -I http://localhost:8084/shop.html\n'
printf '  curl http://localhost:8084/s/data/azzurrotech/products\n'
printf '  curl -i http://localhost:8084/platform   # 308 → /s/portal?client=azzurrotech\n'