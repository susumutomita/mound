# typed: false
# frozen_string_literal: true

# Homebrew formula for mound — 草野球チーム向け試合成立 CLI
#
# This file is a TEMPLATE. On every release, the GitHub Actions release
# workflow regenerates it via scripts/generate-formula.sh and attaches it
# to the GitHub Release as `mound.rb`. Copy the released `mound.rb` to your
# Homebrew tap repository (e.g. susumutomita/homebrew-tap) to publish.
#
# Each platform tarball contains:
#   mound-<platform>/bin/mound          (shell launcher)
#   mound-<platform>/libexec/mound/...  (Bun runtime + JS bundle + libsql native binding)
#
# The placeholders below are intentionally invalid so they fail loudly if you
# forget to regenerate this file.
class Mound < Formula
  desc "草野球チーム向け試合成立 CLI"
  homepage "https://github.com/susumutomita/mound"
  version "0.0.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://example.invalid/mound-vX.Y.Z-macos-arm64.tar.gz"
      sha256 "REPLACE_ME"
    end
    on_intel do
      url "https://example.invalid/mound-vX.Y.Z-macos-x86_64.tar.gz"
      sha256 "REPLACE_ME"
    end
  end

  on_linux do
    on_arm do
      url "https://example.invalid/mound-vX.Y.Z-linux-arm64.tar.gz"
      sha256 "REPLACE_ME"
    end
    on_intel do
      url "https://example.invalid/mound-vX.Y.Z-linux-x86_64.tar.gz"
      sha256 "REPLACE_ME"
    end
  end

  def install
    libexec.install Dir["libexec/mound"]
    bin.install "bin/mound"
  end

  test do
    assert_match "mound", shell_output("#{bin}/mound --version")
  end
end
