# mound

草野球チーム向け試合成立 CLI。試合希望・出欠・状態遷移・監査ログを SQLite (libSQL) に保存し、エージェントからも操作できる単一バイナリで提供する。

> AI は提案する。システムは状態を持つ。人が最後に決める。

## インストール

### Homebrew (推奨)

```bash
brew install susumutomita/tap/mound
```

### GitHub Releases から直接

```bash
# macOS arm64 の例
curl -L -o mound.tar.gz \
  https://github.com/susumutomita/mound/releases/latest/download/mound-vX.Y.Z-macos-arm64.tar.gz
tar -xzf mound.tar.gz
sudo mv mound-macos-arm64 /usr/local/bin/mound
mound --help
```

ターゲット: `macos-arm64` / `macos-x86_64` / `linux-arm64` / `linux-x86_64`。SHA256 はリリースの `checksums.txt` を参照。

### ソースから(開発者向け)

```bash
git clone https://github.com/susumutomita/mound.git
cd mound
make install        # 依存インストール
make install-local  # dist/local/mound-<host> を ~/.local/share/mound に配置 + ~/.local/bin/mound に symlink
mound --version
```

`make cli-build` 単体だと `dist/local/mound-<host>/` のみ生成して PATH には乗せない。`INSTALL_PREFIX` で行き先変更可(`make install-local INSTALL_PREFIX=/opt/homebrew`)。`make uninstall-local` で削除。

> **配布の仕組み:** Bun の `bun build --compile` は libsql の native binding (`@libsql/<platform>/index.node`) を埋め込めない (`@neon-rs/load` が動的 require を使うため)。よって配布物は `bin/mound` (shell launcher) + `libexec/mound/{bun,mound.js,node_modules}` の構造になっており、launcher が Bun runtime + JS bundle + libsql native を組み合わせて実行する。

## クイックスタート

```bash
mound init                                                # DB を初期化 (~/.mound/mound.db)
mound team create --name 横浜BB --area 横浜
mound member add --team <TEAM_ID> --name 山田太郎
mound game create --team <TEAM_ID> --title 練習試合 --date 2026-06-01 --min-players 9
mound game transition <GAME_ID> --to COLLECTING
mound rsvp set --game <GAME_ID> --member <MEMBER_ID> --response AVAILABLE
mound agenda --team <TEAM_ID> --json   # メニューバーアプリが叩く想定
```

`--json` を付ければ全コマンドが機械可読 JSON を返す(エージェント・GUI 連携)。

### DB の保存先

```bash
export MOUND_DB_URL="file:./mound.db"           # ローカルファイル
export MOUND_DB_URL="libsql://xxx.turso.io"     # Turso クラウド
export MOUND_DB_AUTH_TOKEN="..."                # Turso 認証
```

未指定なら `~/.mound/mound.db` を使う。

## CI/Release の仕組み

| Workflow | トリガ | 内容 |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | push / PR | lint + typecheck + test + バイナリ smoke |
| [`release.yml`](.github/workflows/release.yml) | `v*` タグ push | 4 ターゲット tarball + checksums + Homebrew formula を GitHub Release に添付 |

リリース手順:

```bash
git tag v0.1.0
git push origin v0.1.0   # → release.yml が走る
```

リリースが完了したら、Release ページに `mound.rb` が添付されている。これを `susumutomita/homebrew-tap` リポジトリの `Formula/mound.rb` にコピー・コミット・push すれば `brew install susumutomita/tap/mound` で配布できる。

tap リポジトリの最小構成:

```
homebrew-tap/
└── Formula/
    └── mound.rb
```

## 開発

```bash
make check          # lint + typecheck + test
make mound ARGS="--help"
make release-build  # ローカルで 4 ターゲット tarball を生成 (Bun が必要)
```

## 主要コマンド一覧

| コマンド | 用途 |
| --- | --- |
| `make check` | lint + typecheck + test (コミット前に必須) |
| `make cli-build` | 現プラットフォーム向け単一バイナリ (`bin/mound`) |
| `make release-build` | 4 ターゲット tarball + SHA256 を `dist/` に生成 |
| `make help` | 全コマンド一覧 |

## アーキテクチャ

- `packages/cli/` — CLI 本体 (Bun + `@libsql/client` + zod)
- `Formula/` — Homebrew formula テンプレート (リリース時に上書き)
- `scripts/generate-formula.sh` — リリース成果物から formula を組み立てる

GUI は **macOS メニューバーアプリ (Swift / SwiftPM, CodexBar 面取り)** が `mound` CLI を spawn して利用する想定。Web UI は作らない。

## 禁止事項

- 認証情報・秘密鍵のハードコード禁止 (`.env` を使用)
- `make check` が通らない状態でのコミット禁止
- TypeScript strict mode の無効化禁止
