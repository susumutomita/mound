.PHONY: start mound build cli-build release-build cli-clean install-local uninstall-local \
        lint lint-fix lint-check format typecheck test test-watch test-coverage \
        check before-commit clean install install-ci help

BUN := $(or $(shell command -v bun 2>/dev/null),$(HOME)/.bun/bin/bun)
BIOME := ./node_modules/.bin/biome
ENTRY := packages/cli/src/index.ts
DIST := dist
VERSION := $(shell git describe --tags --always 2>/dev/null || echo 0.0.0)

# ===================================================
# 試合成立エンジン — Makefile
# ===================================================

## CLI 起動
start: install mound ## CLI を起動 (引数は ARGS で渡す: make start ARGS="team list")

mound: ## CLI を実行 (例: make mound ARGS="team list")
	$(BUN) run $(ENTRY) $(ARGS)

## バイナリビルド
build: cli-build ## 現プラットフォーム向けバイナリ (bin/mound)

cli-build: ## 現プラットフォーム向け単一バイナリ (bin/mound)
	@mkdir -p bin
	$(BUN) build --compile --minify $(ENTRY) --outfile bin/mound
	@echo "✅ bin/mound built"

release-build: ## 4 ターゲット (macOS arm64/x86_64, Linux arm64/x86_64) tarball を dist/ に生成
	@rm -rf $(DIST)
	@mkdir -p $(DIST)
	@$(MAKE) _release-target TARGET=bun-darwin-arm64  PLATFORM=macos-arm64
	@$(MAKE) _release-target TARGET=bun-darwin-x64    PLATFORM=macos-x86_64
	@$(MAKE) _release-target TARGET=bun-linux-arm64   PLATFORM=linux-arm64
	@$(MAKE) _release-target TARGET=bun-linux-x64     PLATFORM=linux-x86_64
	@cd $(DIST) && shasum -a 256 *.tar.gz > checksums.txt
	@echo "✅ release artifacts:"
	@ls -lh $(DIST)

_release-target:
	@echo "→ building $(PLATFORM) ($(TARGET))"
	@$(BUN) build --compile --minify --target=$(TARGET) $(ENTRY) --outfile $(DIST)/mound-$(PLATFORM)
	@cd $(DIST) && tar -czf mound-$(VERSION)-$(PLATFORM).tar.gz mound-$(PLATFORM)
	@rm -f $(DIST)/mound-$(PLATFORM)

cli-clean: ## ビルド成果物を削除
	rm -rf bin $(DIST)

INSTALL_DIR ?= $(HOME)/.local/bin
install-local: cli-build ## bin/mound を $(INSTALL_DIR) に symlink (デフォルト ~/.local/bin)
	@mkdir -p $(INSTALL_DIR)
	@ln -sf $(abspath bin/mound) $(INSTALL_DIR)/mound
	@echo "✅ $(INSTALL_DIR)/mound -> $(abspath bin/mound)"
	@case ":$$PATH:" in \
	  *":$(INSTALL_DIR):"*) ;; \
	  *) echo "⚠  $(INSTALL_DIR) は PATH に入っていません。~/.zshrc に export PATH=\"$(INSTALL_DIR):\$$PATH\" を追記してください" ;; \
	esac

uninstall-local: ## $(INSTALL_DIR)/mound の symlink を削除
	@rm -f $(INSTALL_DIR)/mound
	@echo "✅ removed $(INSTALL_DIR)/mound"

## 品質チェック
lint: ## Biome lint チェック
	$(BIOME) check .

lint-fix: ## Biome lint 自動修正
	$(BIOME) check --write .

format: ## Biome フォーマット
	$(BIOME) format --write .

typecheck: ## TypeScript 型チェック
	$(BUN) run --filter '*' typecheck

test: ## テスト実行 (Vitest)
	$(BUN) run test

test-watch: ## テスト (watch モード)
	bunx vitest

test-coverage: ## テスト + カバレッジ
	bunx vitest run --coverage

check: lint typecheck test ## lint + typecheck + test 一括実行
	@echo "✅ All checks passed"

before-commit: format lint-fix typecheck test-coverage ## コミット前チェック (自動修正 + typecheck + テスト + カバレッジ)
	@echo "✅ Ready to commit"

lint-check: ## Biome lint + format チェック (CI用、修正しない)
	$(BIOME) check .
	$(BIOME) format .

## セットアップ
install: ## 依存関係インストール
	$(BUN) install

install-ci: ## CI用インストール (install後にlockfile差分チェック)
	$(BUN) install
	git diff --exit-code bun.lock || (echo "ERROR: bun.lock is out of date. Run 'bun install' locally and commit bun.lock." && exit 1)

clean: cli-clean ## ビルド成果物・キャッシュを削除
	rm -rf packages/cli/tsconfig.tsbuildinfo
	rm -rf tsconfig.tsbuildinfo

## ヘルプ
help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
