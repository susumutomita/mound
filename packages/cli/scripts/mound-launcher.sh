#!/bin/sh
# mound — shell launcher.
# Bun runtime と bundle, libsql native binding はインストール先の libexec/ 配下に置く。
set -e
SELF=$(readlink "$0" 2>/dev/null || echo "$0")
DIR=$(cd "$(dirname "$SELF")/.." && pwd)
exec "$DIR/libexec/mound/bun" "$DIR/libexec/mound/mound.js" "$@"
