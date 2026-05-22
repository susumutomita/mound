# mound-ground-scraper

草野球グラウンドの予約システムをスクレイピングし、`GroundAvailability` JSON を stdout に吐く独立 CLI。`mound` 本体には侵入せず、将来 `mound ground import` (未実装) が ingest する想定。

## 使い方

```bash
bun packages/ground-scraper/src/index.ts --list-sources --json
bun packages/ground-scraper/src/index.ts --source mock --date 2026-06-01 --json
bun packages/ground-scraper/src/index.ts --source yokohama --date 2026-06-01 --json   # exit 3 (未実装)
```

## 出力 schema

詳細は `src/types.ts` を参照。

```jsonc
[
  {
    "schema_version": 1,
    "scraped_at": "2026-05-22T10:00:00.000Z",
    "source": "mock",
    "ground": {
      "id": "mock:港北:岸根",
      "name": "岸根公園球技場 (mock)",
      "area": "港北区",
      "url": null
    },
    "date": "2026-06-01",
    "slots": [
      {
        "start": "09:00",
        "end": "12:00",
        "available": true,
        "reservation_key": "mock:港北:岸根|2026-06-01|09:00",
        "price_yen": 3000,
        "note": null
      }
    ]
  }
]
```

## Adapter

| id | 実装状況 | URL |
| --- | --- | --- |
| `mock` | ✅ | (ダミーデータ。決定論的) |
| `yokohama` | 🚧 stub | https://yoyaku.city.yokohama.lg.jp/ — 認証 / reCAPTCHA を要するため未実装。`exit 3` |

新しいサイトの adapter を足す場合は `src/adapters/<source>.ts` を追加し、`src/cli.ts` の `SOURCES` と `dispatch` に登録する。`GroundAvailability[]` を返すこと。

## Exit code

| code | 意味 |
| --- | --- |
| 0 | 正常 |
| 1 | 想定外エラー |
| 2 | Usage / バリデーション |
| 3 | adapter 未実装 (`yokohama` 等) |

## 開発

```bash
bun install
bun run --filter @match-engine/ground-scraper typecheck
bun run test                # vitest が __tests__ を拾う
```
