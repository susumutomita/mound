#!/usr/bin/env bash
# Build a distributable bundle for a given platform.
#
# Layout produced under <out-dir>/mound-<platform>/:
#   bin/mound            - shell launcher (POSIX sh)
#   libexec/mound/bun    - Bun runtime for the target
#   libexec/mound/mound.js
#   libexec/mound/node_modules/  - runtime deps that cannot be bundled
#                                 (currently the @libsql native binding + libsql/@neon-rs glue)
#
# Bun's `--compile` cannot embed the libsql .node native binding because
# @neon-rs/load uses a dynamic require. So we ship the runtime + bundle + the
# small set of unbundlable dependencies side by side and resolve through the
# host's normal node_modules resolution.
#
# Usage: build-dist.sh <platform> <bun-binary-path> <out-dir>
#   platform: macos-arm64 | macos-x86_64 | linux-arm64 | linux-x86_64
#   bun-binary-path: path to the Bun runtime for this platform
#   out-dir: where to place the built directory (e.g. dist/)
set -euo pipefail

PLATFORM="${1:?platform required (macos-arm64 etc.)}"
BUN_BIN_INPUT="${2:?bun runtime path required}"
OUT_DIR="${3:?out dir required}"

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENTRY="$REPO_ROOT/packages/cli/src/index.ts"
LAUNCHER="$REPO_ROOT/packages/cli/scripts/mound-launcher.sh"

# Resolve the *real* Bun executable. `command -v bun` may return a wrapper
# script (e.g., safe-chain's shim in CI), which is useless for distribution.
# Walk symlinks, then if the result is a text/script try standard install
# locations exported by setup-bun.
resolve_bun() {
  local bun="$1"
  # Resolve symlinks if possible
  if command -v readlink >/dev/null 2>&1; then
    local resolved
    resolved=$(readlink -f "$bun" 2>/dev/null || true)
    if [ -n "$resolved" ] && [ -x "$resolved" ]; then
      bun="$resolved"
    fi
  fi
  # If it's binary, accept it.
  if file "$bun" 2>/dev/null | grep -qE "ELF|Mach-O"; then
    echo "$bun"
    return 0
  fi
  # Otherwise, look at known install locations.
  for candidate in \
    "${BUN_INSTALL:-}/bin/bun" \
    "${HOME:-}/.bun/bin/bun" \
    /usr/local/bin/bun \
    /opt/bun/bin/bun
  do
    if [ -x "$candidate" ] && file "$candidate" 2>/dev/null | grep -qE "ELF|Mach-O"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "FATAL: could not resolve a real Bun binary (input was '$1', neither it nor any known path is ELF/Mach-O)" >&2
  exit 1
}

BUN_BIN=$(resolve_bun "$BUN_BIN_INPUT")
echo "Using Bun binary: $BUN_BIN ($(file "$BUN_BIN" | awk -F: '{print $2}' | head -c 60))"

ROOT="$OUT_DIR/mound-$PLATFORM"
rm -rf "$ROOT"
mkdir -p "$ROOT/bin" "$ROOT/libexec/mound/node_modules/@libsql" "$ROOT/libexec/mound/node_modules/@neon-rs"

# 1. shell launcher
install -m 0755 "$LAUNCHER" "$ROOT/bin/mound"

# 2. Bun runtime for the target
install -m 0755 "$BUN_BIN" "$ROOT/libexec/mound/bun"

# 3. JS bundle
"$BUN_BIN" build --target=bun --minify "$ENTRY" --outfile "$ROOT/libexec/mound/mound.js"

# 4. unbundlable runtime deps: @libsql/* (incl. platform native binding) + libsql + @neon-rs + small helpers
NM="$REPO_ROOT/node_modules"
PKG_DEST="$ROOT/libexec/mound/node_modules"

copy_pkg() {
  local src="$1"
  local dst="$2"
  if [ -d "$src" ]; then
    cp -R "$src" "$dst"
  fi
}

# @libsql/client + glue
copy_pkg "$NM/@libsql/client" "$PKG_DEST/@libsql/client"
copy_pkg "$NM/@libsql/core" "$PKG_DEST/@libsql/core"
copy_pkg "$NM/@libsql/hrana-client" "$PKG_DEST/@libsql/hrana-client"
copy_pkg "$NM/@libsql/isomorphic-fetch" "$PKG_DEST/@libsql/isomorphic-fetch"
copy_pkg "$NM/@libsql/isomorphic-ws" "$PKG_DEST/@libsql/isomorphic-ws"

# Platform native binding
case "$PLATFORM" in
  macos-arm64)   NATIVE_PKG="@libsql/darwin-arm64" ;;
  macos-x86_64)  NATIVE_PKG="@libsql/darwin-x64" ;;
  linux-arm64)   NATIVE_PKG="@libsql/linux-arm64-gnu" ;;
  linux-x86_64)  NATIVE_PKG="@libsql/linux-x64-gnu" ;;
  *) echo "unknown platform: $PLATFORM" >&2; exit 1 ;;
esac
if [ ! -d "$NM/$NATIVE_PKG" ]; then
  echo "FATAL: $NM/$NATIVE_PKG not found in node_modules. bun install did not provide the optional native binding for this platform." >&2
  echo "Contents of $NM/@libsql/:" >&2
  ls -la "$NM/@libsql/" 2>&1 >&2 || echo "  (no @libsql dir)" >&2
  exit 1
fi
copy_pkg "$NM/$NATIVE_PKG" "$PKG_DEST/$NATIVE_PKG"

if [ ! -f "$PKG_DEST/$NATIVE_PKG/index.node" ]; then
  echo "FATAL: $PKG_DEST/$NATIVE_PKG/index.node missing after copy" >&2
  ls -la "$PKG_DEST/$NATIVE_PKG/" 2>&1 >&2 || true
  exit 1
fi

# libsql wrapper + @neon-rs/load
copy_pkg "$NM/libsql" "$PKG_DEST/libsql"
copy_pkg "$NM/@neon-rs/load" "$PKG_DEST/@neon-rs/load"
copy_pkg "$NM/detect-libc" "$PKG_DEST/detect-libc"
copy_pkg "$NM/js-base64" "$PKG_DEST/js-base64"
copy_pkg "$NM/promise-limit" "$PKG_DEST/promise-limit"
copy_pkg "$NM/ws" "$PKG_DEST/ws"

# README inside the dist
cat > "$ROOT/README.md" <<EOF
# mound $PLATFORM

\`./bin/mound --help\` を実行してください。
ディレクトリ全体を保ったまま \`mv\` してください (bin/ と libexec/ がペアで必要)。

例: \`sudo cp -R . /usr/local/share/mound && sudo ln -s /usr/local/share/mound/bin/mound /usr/local/bin/mound\`
EOF

echo "✅ built $ROOT"
du -sh "$ROOT" 2>/dev/null || true
echo "--- libexec/mound/node_modules tree (top-level @libsql) ---"
ls -la "$PKG_DEST/@libsql/" 2>&1 || true
echo "--- @neon-rs ---"
ls -la "$PKG_DEST/@neon-rs/" 2>&1 || true
