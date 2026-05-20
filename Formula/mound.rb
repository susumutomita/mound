# typed: false
# frozen_string_literal: true

# Homebrew formula for mound — 草野球チーム向け試合成立 CLI
#
# This file is a TEMPLATE. On every release, the GitHub Actions release
# workflow regenerates it via scripts/generate-formula.sh and attaches it
# to the GitHub Release as `mound.rb`. Copy the released `mound.rb` to your
# Homebrew tap repository (e.g. susumutomita/homebrew-tap) to publish.
#
# The placeholder values below are intentionally invalid so that they fail
# loudly if you forget to regenerate them.
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
    assert_match "mound", shell_output("#{bin}/mound --version")
  end
end
