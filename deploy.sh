#!/usr/bin/env bash
#
# deploy.sh — fail-closed deployment of the azzurro.tech client to stenella.
#
# The static site is uploaded to the azzurrotech song silo. Products and posts
# are upserted into the azzurrotech/products and azzurrotech/posts pod tables.
# A successful exit means every requested operation and read-back check passed.
#
# Requirements: bash, curl, and python3 (JSON is built/validated with Python's
# standard library; no jq or Node runtime is required).
#
# Configuration (environment or ./.env):
#   ATP_URL   atp base URL    (default http://localhost:8084)
#   ATP_USER  admin username  (default admin)
#   ATP_PASS  admin password  (required)
#
# Usage:
#   ATP_PASS=... ./deploy.sh
#   ATP_PASS=... ./deploy.sh --files-only
#   ATP_PASS=... ./deploy.sh --data-only

set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$HERE/azzurro.tech"
CLIENT="azzurrotech"

DO_DATA=1
DO_FILES=1
for arg in "$@"; do
  case "$arg" in
    --files-only) DO_DATA=0 ;;
    --data-only)  DO_FILES=0 ;;
    --help|-h)
      cat <<'USAGE'
Usage: deploy.sh [--files-only|--data-only]
Required environment: ATP_PASS (ATP_URL and ATP_USER are optional).
USAGE
      exit 0
      ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if [ -f "$HERE/.env" ]; then
  # Do not print the file or source contents: it commonly contains ATP_PASS.
  # shellcheck disable=SC1091
  set -a; . "$HERE/.env"; set +a
  if stat -c '%a' "$HERE/.env" 2>/dev/null | grep -Eq '(^|[2367])[0-7]$'; then
    printf 'warning: %s is readable by group/others; chmod 600 %s\n' "$HERE/.env" "$HERE/.env" >&2
  fi
fi

ATP_URL="${ATP_URL:-http://localhost:8084}"
ATP_USER="${ATP_USER:-admin}"
ATP_PASS="${ATP_PASS:-}"

if [ -z "$ATP_PASS" ]; then
  printf 'error: ATP_PASS is required (set it in the environment or ./.env)\n' >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || { printf 'error: python3 is required\n' >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { printf 'error: curl is required\n' >&2; exit 2; }
[ -d "$SITE" ] || { printf 'error: site directory not found: %s\n' "$SITE" >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STATUS_FILE="$WORK/status"
BODY_FILE="$WORK/body"
COOKIE_FILE="$WORK/cookies.txt"
PAYLOAD_FILE="$WORK/payload.json"
EXPECTED_FILE_LIST="$WORK/expected-files"
: > "$EXPECTED_FILE_LIST"
FAILURES=0
declare -a FAILED_ITEMS=()

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '    \033[1;33m%s\033[0m\n' "$*" >&2; }
fail() {
  FAILURES=$((FAILURES + 1))
  FAILED_ITEMS+=("$1")
  warn "$1"
}

status() { cat "$STATUS_FILE" 2>/dev/null || printf '000'; }
body()   { cat "$BODY_FILE" 2>/dev/null || true; }

json_string() {
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1], ensure_ascii=False))' "$1"
}

# call METHOD URL [JSON_DATA] performs one cookie-authenticated ATP request.
# It always leaves an HTTP code in STATUS_FILE; transport errors become 000.
call() {
  local method="$1" url="$2" data="${3:-}"
  local -a args=(--silent --show-error --output "$BODY_FILE" --write-out '%{http_code}'
    --cookie "$COOKIE_FILE" --cookie-jar "$COOKIE_FILE" --request "$method"
    --header 'Accept: application/json')
  if [ -n "$data" ]; then
    printf '%s' "$data" > "$PAYLOAD_FILE"
    args+=(--header 'Content-Type: application/json' --data-binary "@$PAYLOAD_FILE")
  fi
  if ! curl "${args[@]}" "$ATP_URL$url" > "$STATUS_FILE"; then
    printf '000' > "$STATUS_FILE"
    return 1
  fi
}

# check_status CODE_LIST DESCRIPTION accepts only the listed HTTP codes.
check_status() {
  local wanted="$1" description="$2" code
  code="$(status)"
  case " $wanted " in
    *" $code "*) return 0 ;;
  esac
  fail "$description failed (HTTP $code): $(body | head -c 400)"
  return 1
}

json_records() {
  python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    value = json.load(f)
if not isinstance(value, list):
    raise SystemExit('seed is not a JSON array')
for record in value:
    if not isinstance(record, dict) or not record.get('id'):
        raise SystemExit('seed record has no stable id')
    print(json.dumps(record, ensure_ascii=True, separators=(',', ':')))
PY
}

columns_json() {
  python3 -c 'import json,sys; print(json.dumps([{"name": n, "type": "text"} for n in sys.argv[1].split()]))' "$1"
}

quote_path() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe="/-._~"))' "$1"
}

file_json() {
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[2], encoding='utf-8') as f:
    content = f.read()
print(json.dumps({'path': sys.argv[1], 'content': content, 'overwrite': True}, ensure_ascii=False))
PY
}

is_binary() {
  case "$1" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.svg|*.woff|*.woff2|*.pdf) return 0 ;;
    *) return 1 ;;
  esac
}

should_upload() {
  case "$1" in
    legacy/*|data/*|tests/*|README.md|*.map|.env|.env.*|.git|.git/*|*/.env|*/.env.*|*/.git|*/.git/*) return 1 ;;
    *) return 0 ;;
  esac
}

client_exists() {
  python3 - "$BODY_FILE" "$CLIENT" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding='utf-8') as f:
        payload = json.load(f)
except Exception as exc:
    print(f'invalid client-list JSON: {exc}', file=sys.stderr)
    raise SystemExit(2)
if not isinstance(payload, dict) or not isinstance(payload.get('clients'), list):
    print('client-list response has no clients array', file=sys.stderr)
    raise SystemExit(2)
items = payload['clients']
if any(isinstance(item, dict) and item.get('id') == sys.argv[2] for item in items):
    raise SystemExit(0)
raise SystemExit(1)
PY
}

verify_seed() {
  local table="$1" seed="$2"
  if ! call GET "/s/data/$CLIENT/$table?limit=1000"; then
    fail "read-back $table (transport error)"
    return 1
  fi
  if ! check_status 200 "read-back $table"; then
    return 1
  fi
  if ! python3 - "$BODY_FILE" "$seed" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    payload = json.load(f)
with open(sys.argv[2], encoding='utf-8') as f:
    expected = json.load(f)
records = payload.get('records', []) if isinstance(payload, dict) else []
ids = {str(row.get('id', '')) for row in records if isinstance(row, dict)}
missing = [str(row.get('id')) for row in expected if str(row.get('id')) not in ids]
if missing:
    print('missing ids: ' + ', '.join(missing), file=sys.stderr)
    raise SystemExit(1)
if len(records) < len(expected):
    print(f'only {len(records)} records returned; expected at least {len(expected)}', file=sys.stderr)
    raise SystemExit(1)
PY
  then
    fail "read-back $table did not contain every seeded id"
    return 1
  fi
  ok "$table read-back verified"
}

verify_files() {
  local expected="$1" rel verified=0
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    if ! call GET "/c/$CLIENT/$(quote_path "$rel")"; then
      fail "read-back file $rel (transport error)"
      continue
    fi
    if ! check_status 200 "read-back file $rel"; then
      continue
    fi
    verified=$((verified + 1))
  done < "$EXPECTED_FILE_LIST"
  if [ "$verified" -ne "$expected" ]; then
    fail "only $verified of $expected uploaded files could be read back"
    return 1
  fi
  ok "$verified uploaded files verified"
}

login() {
  say "Signing in to atp at $ATP_URL"
  local payload
  payload="{\"user\":$(json_string "$ATP_USER"),\"password\":$(json_string "$ATP_PASS")}"
  if ! call POST /login "$payload"; then
    die_for 'login transport error'
  fi
  check_status 200 'login' || die_for 'login failed'
  ok 'authenticated'
}

die_for() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

# ---- deployment --------------------------------------------------------------

login

say "Ensuring exact client '$CLIENT'"
if ! call GET /api/clients; then
  die_for 'client listing transport error'
fi
if ! check_status 200 'client listing'; then
  die_for 'cannot inspect clients'
fi
if client_exists; then
  ok 'client already exists'
else
  client_lookup_status=$?
  if [ "$client_lookup_status" -eq 2 ]; then
    die_for 'client listing JSON was invalid'
  fi
  if ! call POST /api/clients "{\"id\":$(json_string "$CLIENT")}"; then
    die_for 'create client transport error'
  fi
  if ! check_status '200 201' 'create client'; then
    die_for 'create client failed'
  fi
  # Re-read rather than trusting a fuzzy/substring match.
  if ! call GET /api/clients || ! check_status 200 'client verification listing'; then
    die_for 'client verification failed'
  fi
  if ! client_exists; then
    die_for "client '$CLIENT' was not present after create"
  fi
  ok 'client created and verified'
fi

if [ "$DO_DATA" = 1 ]; then
  products_columns='id name slug price sale_price on_sale short description image featured order'
  posts_columns='id title slug date category excerpt image featured order body'

  for seed in products posts; do
    if ! python3 -m json.tool "$SITE/data/$seed.json" >/dev/null; then
      fail "invalid $seed seed JSON"
    fi
  done
  say "Seeding pod tables for '$CLIENT'"
  if ! call POST /api/pod/tables "{\"table\":\"$CLIENT/products\",\"columns\":$(columns_json "$products_columns")}"; then
    fail 'products table creation transport error'
  elif ! check_status '200 201' 'create products table'; then
    :
  else
    ok 'products table ready'
  fi
  if ! call POST /api/pod/tables "{\"table\":\"$CLIENT/posts\",\"columns\":$(columns_json "$posts_columns")}"; then
    fail 'posts table creation transport error'
  elif ! check_status '200 201' 'create posts table'; then
    :
  else
    ok 'posts table ready'
  fi

  upsert_table() {
    local table="$1" seed="$2" record
    UPSERTED_COUNT=0
    while IFS= read -r record; do
      [ -z "$record" ] && continue
      if ! call POST "/api/pod/table/$CLIENT/$table" "$record"; then
        fail "upsert $table record $((UPSERTED_COUNT + 1)) (transport error)"
        continue
      fi
      if ! check_status '200 201' "upsert $table record $((UPSERTED_COUNT + 1))"; then
        continue
      fi
      UPSERTED_COUNT=$((UPSERTED_COUNT + 1))
    done < <(json_records "$seed")
  }

  upsert_table products "$SITE/data/products.json"
  products_count="$UPSERTED_COUNT"
  upsert_table posts "$SITE/data/posts.json"
  posts_count="$UPSERTED_COUNT"
  ok "$products_count products, $posts_count posts upserted"
  verify_seed products "$SITE/data/products.json" || true
  verify_seed posts "$SITE/data/posts.json" || true
fi

if [ "$DO_FILES" = 1 ]; then
  say "Uploading static files to silo '$CLIENT'"
  uploaded=0
  expected_files=0
  while IFS= read -r -d '' abs; do
    rel="${abs#"$SITE"/}"
    should_upload "$rel" || continue
    printf '%s\n' "$rel" >> "$EXPECTED_FILE_LIST"
    expected_files=$((expected_files + 1))
    if is_binary "$rel"; then
      if ! curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}' \
        --cookie "$COOKIE_FILE" --cookie-jar "$COOKIE_FILE" --request POST \
        --header 'Content-Type: application/octet-stream' --data-binary "@$abs" \
        "$ATP_URL/api/song/silos/$CLIENT/file?path=$(quote_path "$rel")&overwrite=true" > "$STATUS_FILE"; then
        printf '000' > "$STATUS_FILE"
      fi
      if ! check_status '200 201' "upload $rel"; then
        continue
      fi
    else
      if ! call POST "/api/song/silos/$CLIENT/file" "$(file_json "$rel" "$abs")"; then
        fail "upload $rel (transport error)"
        continue
      fi
      if ! check_status '200 201' "upload $rel"; then
        continue
      fi
    fi
    uploaded=$((uploaded + 1))
  done < <(find "$SITE" -type f -print0)
  ok "$uploaded files uploaded"
  if [ "$expected_files" -eq 0 ]; then
    fail 'no static files matched the upload allowlist'
  else
    verify_files "$expected_files" || true
  fi
fi

if [ "$FAILURES" -ne 0 ]; then
  printf '\nERROR: deployment failed (%d operation(s) failed)\n' "$FAILURES" >&2
  for item in "${FAILED_ITEMS[@]}"; do printf '  - %s\n' "$item" >&2; done
  exit 1
fi

say 'Done.'
printf '\nVerify against a running stenella (host-mapped):\n'
printf '  curl -I http://localhost:8084/shop.html\n'
printf '  curl http://localhost:8084/s/data/azzurrotech/products\n'
printf '  curl -i http://localhost:8084/platform   # 308 → /s/portal?client=azzurrotech\n'
