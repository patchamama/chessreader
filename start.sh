#!/usr/bin/env bash
#
# start.sh — boots the chess-ebook-webparser dev stack (PHP API + React web).
#
# What it does:
#   0. Installs what the system lacks (Homebrew on macOS, apt on Debian/Ubuntu):
#      Node, pnpm, PHP, composer, Stockfish, lc0 (Maia; Metal GPU on Apple
#      Silicon) and GNU Chess; downloads the Maia nets; downloads the private
#      resources (chessreader-resources) when they are missing and GitHub
#      access exists (gh login or GITHUB_TOKEN).
#   1. Installs PHP (composer) and JS (pnpm) dependencies if missing.
#   2. Runs DB migrations and seeds an initial admin user (idempotent).
#   3. Starts the PHP backend on :8080 and the Vite frontend on :5173.
#   4. Vite proxies /api -> the backend, so the app works out of the box.
#
# Stop everything with Ctrl-C.
#
# Override defaults via env: API_PORT, WEB_PORT, ADMIN_EMAIL, ADMIN_PASSWORD.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_FILTER="@chess-ebook/web"

API_PORT="${API_PORT:-8080}"
WEB_PORT="${WEB_PORT:-5173}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@chess.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}"

info()  { printf '\033[1;34m[start]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[ ok ]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[fail]\033[0m %s\n' "$1" >&2; exit 1; }

# --- system requirements ---------------------------------------------------
OS="$(uname -s)"
have() { command -v "$1" >/dev/null 2>&1; }
pkg_install() {
  # $1 = command to check, $2 = Homebrew formula, $3 = apt package (empty: none)
  have "$1" && return 0
  if [ "$OS" = "Darwin" ] && have brew; then
    info "Installing $2 (Homebrew)..."; brew install "$2" || info "could not install $2"
  elif have apt-get && [ -n "${3:-}" ]; then
    info "Installing $3 (apt)..."; sudo apt-get install -y "$3" || info "could not install $3"
  else
    info "Please install $1 yourself (no Homebrew/apt found)."
  fi
}
if [ "$OS" = "Darwin" ] && ! have brew; then
  info "Homebrew is not installed: see https://brew.sh (the rest needs it on macOS)."
fi
[ "$OS" = "Linux" ] && have apt-get && sudo apt-get update -y >/dev/null 2>&1 || true
pkg_install node node nodejs
pkg_install php php php-cli
pkg_install composer composer composer
pkg_install stockfish stockfish stockfish
pkg_install gnuchess gnu-chess gnuchess
pkg_install gh gh gh
pkg_install lc0 lc0 ""
if ! have pnpm; then
  if have corepack; then corepack enable >/dev/null 2>&1 || true; fi
  have pnpm || { info "Installing pnpm (npm)..."; npm install -g pnpm >/dev/null 2>&1 || true; }
fi
command -v php       >/dev/null 2>&1 || fail "php not found (need PHP 8.x)"
command -v composer  >/dev/null 2>&1 || fail "composer not found"
command -v pnpm      >/dev/null 2>&1 || fail "pnpm not found (npm i -g pnpm)"

# --- Maia nets (human-like play and hints), for lc0 -------------------------
MAIA_DIR="$API_DIR/storage/maia"
if have lc0; then
  mkdir -p "$MAIA_DIR"
  for r in 1100 1500 1900; do
    if [ ! -f "$MAIA_DIR/maia-$r.pb.gz" ]; then
      info "Downloading Maia $r..."
      curl -sfL -o "$MAIA_DIR/maia-$r.pb.gz" "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-$r.pb.gz" || info "could not download Maia $r"
    fi
  done
  ok "Maia nets in $MAIA_DIR"
else
  info "lc0 not available: Maia (human-like engine) is skipped. Linux: https://github.com/LeelaChessZero/lc0/releases"
fi

# --- private resources (commentary DB, game DB, traps) ----------------------
RES_REPO="${RESOURCES_REPO:-patchamama/chessreader-resources}"
RES_DIR="$API_DIR/storage/resources"
install_resources() {
  local src="$1"
  mkdir -p "$RES_DIR"
  for f in books games traps ratings; do [ -f "$src/$f.json" ] && cp "$src/$f.json" "$RES_DIR/"; done
  [ -f "$src/games.sqlite" ] && cp "$src/games.sqlite" "$RES_DIR/"
  if [ -d "$src/games" ]; then for g in "$src"/games/*.json; do cp "$g" "$RES_DIR/games-$(basename "$g")"; done; fi
  [ -f "$src/comments.sqlite" ] && cp "$src/comments.sqlite" "$API_DIR/storage/comments.sqlite"
  ok "Resources installed in $RES_DIR"
}
if [ ! -f "$RES_DIR/books.json" ]; then
  TMP_RES="$API_DIR/storage/.resources-repo"
  rm -rf "$TMP_RES"
  if have gh && gh auth status >/dev/null 2>&1 && gh repo view "$RES_REPO" >/dev/null 2>&1; then
    info "Downloading private resources ($RES_REPO) with gh..."
    gh repo clone "$RES_REPO" "$TMP_RES" -- --depth 1 --quiet && install_resources "$TMP_RES"
  elif [ -n "${GITHUB_TOKEN:-}" ]; then
    info "Downloading private resources ($RES_REPO) with GITHUB_TOKEN..."
    git clone --depth 1 --quiet "https://x-access-token:${GITHUB_TOKEN}@github.com/${RES_REPO}.git" "$TMP_RES" && install_resources "$TMP_RES"
  else
    info "Private resources not found and no GitHub access (gh login or GITHUB_TOKEN): the app runs without them."
  fi
  rm -rf "$TMP_RES"
else
  ok "Private resources present"
fi

# --- dependencies ----------------------------------------------------------
if [ ! -d "$API_DIR/vendor" ]; then
  info "Installing PHP dependencies (composer install)..."
  composer install --working-dir="$API_DIR"
  ok "PHP dependencies installed"
else
  ok "PHP dependencies present"
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  info "Installing JS dependencies (pnpm install)..."
  (cd "$ROOT_DIR" && pnpm install)
  ok "JS dependencies installed"
else
  ok "JS dependencies present"
fi

# --- shared package (the web app and the scripts read its build) ------------
info "Building @chess-ebook/chess-shared..."
(cd "$ROOT_DIR" && pnpm --filter @chess-ebook/chess-shared build >/dev/null)
ok "chess-shared built"

# --- database: migrate + seed admin ---------------------------------------
info "Running database migrations..."
php "$API_DIR/bin/migrate.php"
ok "Migrations applied"

info "Seeding admin user ($ADMIN_EMAIL)..."
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  php "$API_DIR/bin/seed-admin.php" "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

# --- process management ----------------------------------------------------
PIDS=()
cleanup() {
  info "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  wait >/dev/null 2>&1 || true
  ok "Stopped"
}
trap cleanup INT TERM EXIT

# Backend: PHP built-in server with public/ as docroot.
# AUTH_DEV_BYPASS=1 makes login optional in dev (tokenless requests = synthetic admin).
info "Starting PHP API on http://127.0.0.1:$API_PORT ..."
AUTH_DEV_BYPASS="${AUTH_DEV_BYPASS:-1}" \
  php -S "127.0.0.1:$API_PORT" -t "$API_DIR/public" >/tmp/chess-api.log 2>&1 &
PIDS+=("$!")

# Frontend: Vite dev server (proxies /api -> the backend).
info "Starting Vite web on http://127.0.0.1:$WEB_PORT ..."
VITE_API_TARGET="http://127.0.0.1:$API_PORT" \
  pnpm --filter "$WEB_FILTER" dev --port "$WEB_PORT" --host 127.0.0.1 &
PIDS+=("$!")

ok "Stack up."
echo
echo "    Web:    http://127.0.0.1:$WEB_PORT"
echo "    API:    http://127.0.0.1:$API_PORT/api/health"
echo "    Admin:  $ADMIN_EMAIL / $ADMIN_PASSWORD"
echo "    Logs:   /tmp/chess-api.log (backend)"
echo
info "Press Ctrl-C to stop."

# Wait on the background jobs; if one dies, cleanup runs via the trap.
wait
