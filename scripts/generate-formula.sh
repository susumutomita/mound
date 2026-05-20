#!/usr/bin/env bash
# Generate a Homebrew formula for mound from release artifacts.
#
# Usage:
#   scripts/generate-formula.sh <version> <owner/repo> <dist-dir> > Formula/mound.rb
#
# Reads <dist-dir>/mound-<version>-<platform>.tar.gz.sha256 for each platform
# and emits a Ruby formula with the correct URL + SHA256 per arch.
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
    if OS.mac? && Hardware::CPU.arm?
      bin.install "mound-macos-arm64" => "mound"
    elsif OS.mac?
      bin.install "mound-macos-x86_64" => "mound"
    elsif OS.linux? && Hardware::CPU.arm?
      bin.install "mound-linux-arm64" => "mound"
    else
      bin.install "mound-linux-x86_64" => "mound"
    end
  end

  test do
    assert_match "mound 0.1.0", shell_output("#{bin}/mound --version")
  end
end
EOF
