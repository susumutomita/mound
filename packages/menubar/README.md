# MoundMenuBar

macOS メニューバー常駐アプリ。30 秒間隔で `mound agenda --json` を spawn し、5 バケットの件数(公開待ち / 出欠集計中 / 開催間近 / 完了入力待ち / 精算待ち)をポップオーバーに表示する。CodexBar 風の Dock アイコンなし常駐 UI。

## 必要環境

- macOS 14+
- Swift 5.9+ (Xcode 15 同梱)
- `mound` バイナリが PATH に通っているか、`/opt/homebrew/bin` / `/usr/local/bin` / `~/.local/bin` のいずれかに配置されていること

## ビルド & 起動

```bash
cd packages/menubar
swift build
swift run MoundMenuBar
```

## テスト

```bash
cd packages/menubar
swift test
```

## カスタム mound パス

`MOUND_BIN` 環境変数で上書きできる:

```bash
MOUND_BIN=/path/to/mound swift run MoundMenuBar
```

## スコープ(MVP)

- 5 バケットの **件数** 表示
- 30 秒間隔の自動更新
- 「更新」「終了」ボタン
- バイナリ未検出 / mound 実行失敗時のエラー表示

## やらないこと(別 Issue で)

- 試合詳細の閲覧
- 状態遷移 / RSVP 操作
- 通知 (`UserNotifications`)
- 設定画面 (`Settings`)
- アイコン / メニューバーアイコンのカスタム
- 配布 (notarization, dmg)
