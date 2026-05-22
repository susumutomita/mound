#!/usr/bin/env bash
# ground-monitoring (susumutomita/ground-reservation) を GitHub Releases から
# DL して INSTALL_PREFIX に配置する。
#
# 使い方:
#   ./scripts/install-ground-monitoring.sh <HOST_PLATFORM> <INSTALL_PREFIX> [<VERSION>] [<REPO>]
#
# 引数:
#   HOST_PLATFORM    mound の Makefile が決めるホスト識別子 (macos-arm64 / macos-x86_64 /
#                    linux-arm64 / linux-x86_64)。macos-x86_64 は Rosetta 用に
#                    内部で macos-arm64 にフォールバックする。
#   INSTALL_PREFIX   配置先のプレフィックス。例: $HOME/.local
#   VERSION          ground-reservation のタグ。省略時は v2.1.0
#   REPO             susumutomita/ground-reservation を上書きしたい場合に
#
# 失敗 (network NG / 検証失敗 / 未対応 platform) しても exit 0 で返し、
# 呼び出し元 (make install-local) を巻き込まない。代わりに警告を出す。
#
# DL は gh CLI があれば gh release download を、無ければ curl --location を使う。
# GitHub の生 release download URL は時々 404 を返す (CDN propagation 等) ので
# gh を優先する。
set -uo pipefail

PLATFORM="${1:-}"
PREFIX="${2:-}"
VERSION="${3:-v2.1.0}"
REPO="${4:-susumutomita/ground-reservation}"

if [ -z "$PLATFORM" ] || [ -z "$PREFIX" ]; then
  echo "usage: $0 <HOST_PLATFORM> <INSTALL_PREFIX> [<VERSION>] [<REPO>]" >&2
  exit 0
fi

# mound の HOST_PLATFORM → ground-reservation の配布物名にマップ。
# ground-reservation は macos-x86_64 を配っていないので Rosetta 経由で macos-arm64 を使う。
case "$PLATFORM" in
  macos-arm64|macos-x86_64) GR_TARGET=macos-arm64 ;;
  linux-x86_64)             GR_TARGET=linux-x86_64 ;;
  linux-arm64)              GR_TARGET=linux-arm64 ;;
  *)
    echo "⚠  ground-monitoring: 未対応 platform '$PLATFORM' — スキップします" >&2
    exit 0
    ;;
esac

if [ "$PLATFORM" = "macos-x86_64" ]; then
  echo "ℹ️ ground-monitoring: macos-x86_64 用バイナリは無いため Rosetta 経由で macos-arm64 を使います" >&2
fi

TARBALL="ground-monitoring-${GR_TARGET}.tar.gz"
SHA="ground-monitoring-${GR_TARGET}.sha256"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1 ファイルを DL する。gh があれば優先、無ければ curl にフォールバック。
download_file() {
  local name="$1"
  local out="$2"
  if command -v gh >/dev/null 2>&1; then
    if gh release download "$VERSION" --repo "$REPO" --pattern "$name" --output "$out" >/dev/null 2>&1; then
      return 0
    fi
  fi
  local url="https://github.com/${REPO}/releases/download/${VERSION}/${name}"
  if curl --fail --location --silent --show-error -o "$out" "$url"; then
    return 0
  fi
  echo "⚠  ground-monitoring: 取得失敗 $name (gh / curl 両方)" >&2
  return 1
}

echo "==> ground-monitoring ${VERSION} (${GR_TARGET}) を取得"
if ! download_file "$TARBALL" "$TMP/$TARBALL"; then exit 0; fi
if ! download_file "$SHA" "$TMP/$SHA";       then exit 0; fi

echo "==> sha256 検証"
verify_ok=0
if command -v shasum >/dev/null 2>&1; then
  (cd "$TMP" && shasum -a 256 -c "$SHA" >/dev/null 2>&1) && verify_ok=1
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$TMP" && sha256sum -c "$SHA" >/dev/null 2>&1) && verify_ok=1
else
  echo "⚠  ground-monitoring: shasum / sha256sum が無いので検証スキップ" >&2
  verify_ok=1
fi
if [ "$verify_ok" -ne 1 ]; then
  echo "⚠  ground-monitoring: sha256 検証に失敗 — スキップします" >&2
  exit 0
fi

echo "==> ${PREFIX}/share/ground-monitoring に展開"
mkdir -p "$PREFIX/share" "$PREFIX/bin"
rm -rf "$PREFIX/share/ground-monitoring"
mkdir -p "$TMP/extract"
tar -xzf "$TMP/$TARBALL" -C "$TMP/extract"
if [ ! -d "$TMP/extract/ground-monitoring-${GR_TARGET}" ]; then
  echo "⚠  ground-monitoring: tarball の構造が想定外 — スキップします" >&2
  exit 0
fi
mv "$TMP/extract/ground-monitoring-${GR_TARGET}" "$PREFIX/share/ground-monitoring"

ln -sf "$PREFIX/share/ground-monitoring/ground-monitoring" "$PREFIX/bin/ground-monitoring"

if ! "$PREFIX/bin/ground-monitoring" --help >/dev/null 2>&1; then
  echo "⚠  ground-monitoring: smoke test に失敗 — シンボリックリンクは残しますが動作確認してください" >&2
fi

echo "✅ ${PREFIX}/bin/ground-monitoring -> ${PREFIX}/share/ground-monitoring/ground-monitoring"
