# CLAUDE.md

## プロジェクト概要

草野球チーム向け試合成立 CLI。試合希望・出欠・状態遷移・監査ログを libSQL (SQLite/Turso) に保存し、`mound` コマンドで操作する。GUI は CodexBar 風 macOS メニューバーアプリのみ(CLI を spawn ラップ)。詳細は [SPEC.md](./SPEC.md)。

## コマンド

```bash
make check          # lint + typecheck + test (変更後に必ず実行)
make lint-fix       # 自動修正
make test           # テスト実行
make mound ARGS="--help"  # CLI 実行
make cli-build      # bin/mound にバイナリを生成
make install-local  # bin/mound を $HOME/.local/bin に symlink
make release-build  # 4 ターゲット tarball を dist/ に生成
make help           # 全コマンド一覧
```

## アーキテクチャ (Clean Architecture)

依存方向は常に内向き(domain ← usecases ← adapters):

```
packages/cli/src/
├── domain/              # 内側: 純粋な型 + 不変ルール (I/O 非依存)
│   ├── types.ts         # エンティティ・値型・状態列挙
│   ├── guards.ts        # isGameStatus / assertGameStatus 等
│   └── state-machine.ts # 状態遷移 + ガード条件
├── ports.ts             # アプリケーション境界: Repository インターフェイス + UseCaseContext
├── usecases/            # ビジネスルール: ports.ts のみ依存。DB も CLI も知らない
│   ├── team.ts          # createTeam / listTeams
│   ├── member.ts        # addMember / listMembers
│   ├── game.ts          # createGame / listGames / showGame / transitionGame
│   ├── rsvp.ts          # setRsvp / listRsvpsWithMembers / summarizeRsvps
│   ├── audit.ts         # writeAuditLog / listAuditLogs
│   ├── agenda.ts        # computeAgenda
│   └── errors.ts        # ドメイン例外
└── adapters/            # 外側: ports.ts を実装、または駆動する
    ├── libsql/          # libSQL 実装
    │   ├── client.ts    # DB 接続 + lazy migration (PRAGMA user_version)
    │   ├── schema.ts    # DDL + SCHEMA_VERSION
    │   ├── row-mappers.ts
    │   └── repositories.ts  # buildRepositories(db): Repositories
    └── cli/             # CLI 駆動層: argv → usecase → 出力
        ├── args.ts      # フラグパーサ
        ├── output.ts    # JSON / TSV レンダラ
        ├── help.ts
        ├── zod-helper.ts
        ├── compose.ts   # DI ワイヤリング
        ├── cli.ts       # ディスパッチャ
        └── commands/    # 各サブコマンドの薄いアダプタ
```

新機能を作るときの順序:

1. `domain/` に必要な型・ルールを足す
2. `ports.ts` を見て足りない repository メソッドがあれば追加
3. `usecases/<feature>.ts` にビジネスロジックを書く(ports.ts と domain/ のみ import)
4. `adapters/libsql/repositories.ts` に SQL 実装を足す
5. `adapters/cli/commands/<feature>.ts` で usecase を呼ぶ
6. usecase の単体テスト(in-memory ポートで)+ e2e テストを追加

## 開発ルール

### 変更後は必ず `make check` を通す

lint・型チェック・テストが全て通ることを確認してからコミットする。

### テスト — BDD スタイル

日本語の `describe` / `it` で振る舞いを記述する。テスト名は「〜のとき」「〜する」形式。

```ts
describe("transitionGame", () => {
  describe("人数不足のとき", () => {
    it("CONFIRMED への遷移を拒否する", () => { ... });
  });
});
```

- Arrange-Act-Assert
- 1 つの `it` で 1 振る舞い
- ファクトリ関数(`createTeam()` 等)でデフォルト値、差分だけ `overrides` で渡す
- ユースケース層は **in-memory な port 実装(fake)** に対してテストする(`__tests__/usecases/`)
- 統合は `e2e-binary.test.ts` でコンパイル済みバイナリ越しに踏む

### 依存方向の禁則

- `domain/` から `adapters/` や `usecases/` を import するな
- `usecases/` から `adapters/` を import するな(逆はOK)
- `adapters/libsql/` から `adapters/cli/` を import するな(逆もNG)

### 禁止事項

- 認証情報・秘密鍵のハードコード禁止 → 環境変数 (`MOUND_DB_AUTH_TOKEN` 等)
- TypeScript strict mode の無効化禁止
- ユーザー入力の無検証使用禁止(必ず Zod スキーマで検証)
- DB-row 値を `as` で union 型へ無検査キャスト禁止(`domain/guards.ts` の assert\* を使う)

### Git コミット

`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` のプレフィックスを使用。

## 配布

- ローカル: `make install-local` で `~/.local/bin/mound` に symlink
- リリース: `git tag v0.X.Y && git push origin v0.X.Y` で `.github/workflows/release.yml` が走り、4 プラットフォーム tarball + Homebrew formula を Release に添付
- Homebrew: `Formula/mound.rb` (テンプレ) を `scripts/generate-formula.sh` が値埋め生成。`susumutomita/homebrew-tap` リポジトリにコピーして配布

## 商用品質基準

- 全コマンド `--json` を受け付ける(エージェント / GUI 連携)
- ドメイン例外は `usecases/errors.ts` に分類し、CLI 層で exit code に翻訳
- libSQL クエリは必ずパラメータ化(`?` プレースホルダ)
- DB 接続は `ensureSchemaUpToDate` で lazy migration(`PRAGMA user_version`)
