#!/usr/bin/env bash
# install.sh — clone ChessReader and set up all dependencies
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/patchamama/chessreader/main/install.sh | bash
#   — or —
#   bash install.sh [target-directory]
#
# After this script finishes, cd into the directory and run:
#   bash start.sh

set -euo pipefail

REPO_URL="https://github.com/patchamama/chessreader.git"
TARGET="${1:-chessreader}"

info()  { printf '\033[1;34m[install]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[  ok  ]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[ fail ]\033[0m %s\n' "$1" >&2; exit 1; }

# ── prerequisite checks ─────────────────────────────────────────────────────
command -v git      >/dev/null 2>&1 || fail "git is not installed"
command -v php      >/dev/null 2>&1 || fail "PHP is not installed (need PHP 8.1+)"
command -v composer >/dev/null 2>&1 || fail "Composer is not installed (https://getcomposer.org)"
command -v node     >/dev/null 2>&1 || fail "Node.js is not installed (need 18+)"

# pnpm — install automatically if missing
if ! command -v pnpm >/dev/null 2>&1; then
  info "pnpm not found — installing via npm..."
  npm install -g pnpm || fail "Could not install pnpm"
  ok "pnpm installed"
fi

PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')
info "PHP $PHP_VERSION detected"

# ── clone ────────────────────────────────────────────────────────────────────
if [ -d "$TARGET/.git" ]; then
  info "Directory '$TARGET' already exists — pulling latest changes..."
  git -C "$TARGET" pull --ff-only
else
  info "Cloning $REPO_URL into '$TARGET'..."
  git clone "$REPO_URL" "$TARGET"
fi
ok "Repository ready at ./$TARGET"

cd "$TARGET"

# ── PHP dependencies ─────────────────────────────────────────────────────────
info "Installing PHP dependencies..."
composer install --working-dir=apps/api --no-interaction --prefer-dist
ok "PHP dependencies installed"

# ── JS dependencies ───────────────────────────────────────────────────────────
info "Installing JS dependencies..."
pnpm install
ok "JS dependencies installed"

# ── done ─────────────────────────────────────────────────────────────────────
echo
echo "  ✔  ChessReader is ready!"
echo
echo "  Start the app:"
echo "    cd $TARGET"
echo "    bash start.sh"
echo
echo "  Optional env overrides:"
echo "    API_PORT=8080 WEB_PORT=5173 bash start.sh"
echo "    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret bash start.sh"
echo
