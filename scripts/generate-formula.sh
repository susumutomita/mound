#!/usr/bin/env bash
# Generate a Homebrew formula for mound from release artifacts.
#
# Usage:
#   scripts/generate-formula.sh <version> <owner/repo> <dist-dir> > Formula/mound.rb
#
# Each platform tarball contains:
#   mound-<platform>/bin/mound          (shell launcher)
#   mound-<platform>/libexec/mound/...  (Bun runtime + JS bundle + native deps)
set -euo pipefail

VERSION="${1:?version (e.g. v0.1.0) required}"
REPO="${2:?owner/repo required}"
DIST="${3:?dist dir required}"

bare_version="${VERSION#v}"

read_sha() {
  local platform="$1"
  local file="$DIST/mound-$VERSION-$platform.tar.gz.sha256"
  if [ ! -f "$file" ]; then
    echo "missing checksum file: $file" >&2
    exit 1
  fi
  awk '{print $1}' "$file"
}

SHA_MACOS_ARM=$(read_sha macos-arm64)
SHA_MACOS_X86=$(read_sha macos-x86_64)
SHA_LINUX_ARM=$(read_sha linux-arm64)
SHA_LINUX_X86=$(read_sha linux-x86_64)

cat <<EOF
class Mound < Formula
  desc "草野球チーム向け試合成立 CLI"
  homepage "https://github.com/$REPO"
  version "$bare_version"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/$REPO/releases/download/$VERSION/mound-$VERSION-macos-arm64.tar.gz"
      sha256 "$SHA_MACOS_ARM"
    end
    on_intel do
      url "https://github.com/$REPO/releases/download/$VERSION/mound-$VERSION-macos-x86_64.tar.gz"
      sha256 "$SHA_MACOS_X86"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/$REPO/releases/download/$VERSION/mound-$VERSION-linux-arm64.tar.gz"
      sha256 "$SHA_LINUX_ARM"
    end
    on_intel do
      url "https://github.com/$REPO/releases/download/$VERSION/mound-$VERSION-linux-x86_64.tar.gz"
      sha256 "$SHA_LINUX_X86"
    end
  end

  def install
    libexec.install Dir["libexec/mound"]
    bin.install "bin/mound"
    # The launcher resolves \$(dirname \$0)/.. which after a Homebrew
    # install lands at the keg prefix, so libexec/mound/{bun,mound.js,node_modules}
    # are reachable.
  end

  test do
    assert_match "mound $bare_version", shell_output("#{bin}/mound --version")
  end
end
EOF
