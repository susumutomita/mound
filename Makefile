.PHONY: start mound build cli-build dist-clean install-local uninstall-local \
        install-ground-monitoring uninstall-ground-monitoring \
        lint lint-fix lint-check format typecheck test test-watch test-coverage \
        check before-commit clean install install-ci help

BUN := $(or $(shell command -v bun 2>/dev/null),$(HOME)/.bun/bin/bun)
BIOME := ./node_modules/.bin/biome
ENTRY := packages/cli/src/index.ts
DIST := dist

# Host platform detection (for `make cli-build` / `make install-local`).
HOST_OS := $(shell uname -s | tr A-Z a-z)
HOST_ARCH := $(shell uname -m)
ifeq ($(HOST_OS),darwin)
  ifeq ($(HOST_ARCH),arm64)
    HOST_PLATFORM := macos-arm64
  else
    HOST_PLATFORM := macos-x86_64
  endif
else
  ifeq ($(HOST_ARCH),aarch64)
    HOST_PLATFORM := linux-arm64
  else
    HOST_PLATFORM := linux-x86_64
  endif
endif

# ===================================================
# 試合成立エンジン — Makefile
# ===================================================

## CLI 起動
start: install mound ## CLI を起動 (引数は ARGS で渡す: make start ARGS="team list")

mound: ## CLI を実行 (例: make mound ARGS="team list")
	$(BUN) run $(ENTRY) $(ARGS)

## バイナリ配布
build: cli-build ## 現プラットフォーム向け配布物 (dist/local/mound-<host>)

cli-build: ## 現プラットフォーム向け配布物を dist/local に生成
	@rm -rf $(DIST)/local
	@mkdir -p $(DIST)/local
	@bash scripts/build-dist.sh $(HOST_PLATFORM) $(BUN) $(DIST)/local
	@echo "✅ $(DIST)/local/mound-$(HOST_PLATFORM)"

dist-clean: ## dist/ を全削除
	rm -rf $(DIST)

INSTALL_PREFIX ?= $(HOME)/.local

# 連携先 ground-monitoring (susumutomita/ground-reservation) のバージョンとリポジトリ。
# `GROUND_RES_VERSION=v2.2.0 make install-local` のように上書き可能。
GROUND_RES_VERSION ?= v2.1.0
GROUND_RES_REPO ?= susumutomita/ground-reservation

install-local: cli-build install-ground-monitoring ## $(INSTALL_PREFIX)/{bin,share} に mound + ground-monitoring を配置
	@mkdir -p $(INSTALL_PREFIX)/share $(INSTALL_PREFIX)/bin
	@rm -rf $(INSTALL_PREFIX)/share/mound
	@cp -R $(DIST)/local/mound-$(HOST_PLATFORM) $(INSTALL_PREFIX)/share/mound
	@ln -sf $(INSTALL_PREFIX)/share/mound/bin/mound $(INSTALL_PREFIX)/bin/mound
	@echo "✅ $(INSTALL_PREFIX)/bin/mound -> $(INSTALL_PREFIX)/share/mound/bin/mound"
	@case ":$$PATH:" in \
	  *":$(INSTALL_PREFIX)/bin:"*) ;; \
	  *) echo "⚠  $(INSTALL_PREFIX)/bin は PATH に入っていません" ;; \
	esac

install-ground-monitoring: ## ground-monitoring を GitHub Releases から取って $(INSTALL_PREFIX) に配置
	@bash scripts/install-ground-monitoring.sh \
	  $(HOST_PLATFORM) $(INSTALL_PREFIX) $(GROUND_RES_VERSION) $(GROUND_RES_REPO)

uninstall-local: uninstall-ground-monitoring ## $(INSTALL_PREFIX) から mound と ground-monitoring を削除
	@rm -f $(INSTALL_PREFIX)/bin/mound
	@rm -rf $(INSTALL_PREFIX)/share/mound
	@echo "✅ uninstalled mound from $(INSTALL_PREFIX)"

uninstall-ground-monitoring: ## $(INSTALL_PREFIX) から ground-monitoring を削除
	@rm -f $(INSTALL_PREFIX)/bin/ground-monitoring
	@rm -rf $(INSTALL_PREFIX)/share/ground-monitoring
	@echo "✅ uninstalled ground-monitoring from $(INSTALL_PREFIX)"

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

clean: dist-clean ## ビルド成果物・キャッシュを削除
	rm -rf bin packages/cli/tsconfig.tsbuildinfo
	rm -rf tsconfig.tsbuildinfo

## ヘルプ
help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
