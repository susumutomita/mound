# mound

草野球チーム向け試合成立 CLI。試合希望・出欠・状態遷移・監査ログを SQLite (libSQL / Turso) に保存し、エージェントや CodexBar 風 macOS メニューバーアプリから操作できる。

> AI は提案する。システムは状態を持つ。人が最後に決める。

## インストール

### Homebrew (推奨)

```bash
brew install susumutomita/tap/mound
mound --version
```

### GitHub Releases から直接

配布物は単一バイナリではなく、`bin/mound`(POSIX sh launcher)+ `libexec/mound/`(Bun runtime + JS bundle + libsql native binding)のディレクトリ構造。ディレクトリ全体を保ったまま移動する必要がある。

```bash
# macOS arm64 の例
curl -L -o mound.tar.gz \
  https://github.com/susumutomita/mound/releases/latest/download/mound-vX.Y.Z-macos-arm64.tar.gz
tar -xzf mound.tar.gz                                   # → mound-macos-arm64/
sudo cp -R mound-macos-arm64 /usr/local/share/mound
sudo ln -sf /usr/local/share/mound/bin/mound /usr/local/bin/mound
mound --version
```

ターゲット: `macos-arm64` / `macos-x86_64` / `linux-arm64` / `linux-x86_64`。SHA256 はリリースの `checksums.txt` を参照。

### ソースから(開発者向け)

```bash
git clone https://github.com/susumutomita/mound.git
cd mound
make install        # 依存インストール (Bun deps)
make install-local  # mound + ground-monitoring を $HOME/.local/{bin,share} に配置
mound --version
ground-monitoring --version
```

`make install-local` は以下を一括でやる:

1. `dist/local/mound-<host>/` を生成し `$HOME/.local/share/mound` にコピー、`$HOME/.local/bin/mound` に launcher への symlink を張る
2. `susumutomita/ground-reservation` の最新 release から `ground-monitoring-<host>` tarball を DL + sha256 検証し、`$HOME/.local/share/ground-monitoring` に展開、`$HOME/.local/bin/ground-monitoring` に symlink

これで `mound ground sync --notify --team $TEAM` が依存込みで動く状態になる。`make cli-build` 単体だと `dist/local/mound-<host>/` を生成するだけで PATH に乗らない。

`INSTALL_PREFIX` で行き先変更可(例: `make install-local INSTALL_PREFIX=/opt/homebrew`)。連携先 ground-reservation のタグは `GROUND_RES_VERSION=v2.2.0 make install-local` で上書き可能(既定: `v2.1.0`)。`make uninstall-local` で両方削除。ネットワーク不能等で ground-monitoring の取得に失敗しても mound 本体のインストールは続行される(警告のみ)。

> **配布の仕組み:** Bun の `bun build --compile` は libsql の native binding (`@libsql/<platform>/index.node`) を埋め込めない(`@neon-rs/load` が動的 require を使うため)。配布物は `bin/mound` (POSIX sh launcher) + `libexec/mound/{bun, mound.js, node_modules}` の構造で、launcher が `$(dirname "$0")/../libexec/mound/bun` を `exec` して JS bundle を Bun runtime で動かす。

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

## GUI: MoundMenuBar (macOS メニューバー)

`packages/menubar/` に macOS 14+ 用のメニューバー常駐アプリがある(CodexBar 面取り)。30 秒ごとに `mound agenda --json` を spawn してポップオーバーに 5 バケットの件数を出すだけの薄いラッパー。

```bash
cd packages/menubar
swift run MoundMenuBar
```

詳細は [`packages/menubar/README.md`](packages/menubar/README.md)。

## CI / Release

| Workflow | トリガ | 内容 |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | push / PR | lint + typecheck + test + 実 tarball isolation smoke + `swift build`/`swift test` (menubar) + shellcheck |
| [`release.yml`](.github/workflows/release.yml) | `v*` タグ push | 4 プラットフォーム tarball + checksums + Homebrew formula を Release に添付 |

リリース手順:

```bash
git tag v0.1.0
git push origin v0.1.0   # → release.yml が走り、各 native runner で build + isolation smoke 後 upload
```

リリース完了後、Release ページに `mound.rb`(値埋め済み)が添付される。`susumutomita/homebrew-tap` リポジトリの `Formula/mound.rb` にコピー・コミット・push すれば `brew install susumutomita/tap/mound` で配布できる。

tap リポジトリの最小構成:

```
homebrew-tap/
└── Formula/
    └── mound.rb
```

## 開発

```bash
make check          # lint + typecheck + test (コミット前必須)
make mound ARGS="--help"
make cli-build      # 現プラットフォーム向け dist/local/mound-<host>/ を生成
make install-local  # PATH に通す
```

## 主要コマンド一覧

| コマンド | 用途 |
| --- | --- |
| `make check` | lint + typecheck + test |
| `make cli-build` | 現プラットフォーム向け配布物を `dist/local/mound-<host>/` に生成 |
| `make install-local` | `$HOME/.local/{bin,share}` にインストール |
| `make uninstall-local` | アンインストール |
| `make help` | 全コマンド一覧 |

## アーキテクチャ

```
packages/
├── cli/                  # mound 本体 (Bun + @libsql/client + zod)
│   ├── src/
│   │   ├── domain/       # 純粋ロジック (types, state-machine, guards)
│   │   ├── ports.ts      # Repository インターフェイス
│   │   ├── usecases/     # ビジネスルール (ports.ts のみ依存)
│   │   └── adapters/
│   │       ├── libsql/   # libSQL 実装
│   │       └── cli/      # argv → usecase → 出力
│   └── scripts/
│       └── mound-launcher.sh   # POSIX sh launcher (配布物に同梱)
└── menubar/              # macOS 14+ メニューバー常駐アプリ (SwiftPM)
    ├── Sources/MoundMenuBar/
    └── Tests/

Formula/mound.rb          # Homebrew formula テンプレート (リリース時に上書き)
scripts/
├── build-dist.sh         # tarball 用配布物を組み立てる
└── generate-formula.sh   # リリース成果物から Formula を生成
```

依存方向は **adapters → usecases → ports → domain** の一方向のみ。詳細は [CLAUDE.md](./CLAUDE.md)。

## 禁止事項

- 認証情報・秘密鍵のハードコード禁止(`MOUND_DB_AUTH_TOKEN` 等の環境変数を使う)
- `make check` が通らない状態でのコミット禁止
- TypeScript strict mode の無効化禁止
- DB-row 値を `as` で union 型へ無検査キャスト禁止(`domain/guards.ts` の `assert*` を使う)
