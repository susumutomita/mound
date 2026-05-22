// mound-ground-scraper の JSON 出力スキーマ。
// mound 本体 (将来の `mound ground import`) がこの shape をそのまま ingest できることを意図する。
// 破壊的変更が必要になった場合は version フィールドを増やす。

import { z } from "zod";

export const SCHEMA_VERSION = 1;

// 1 スロット = 1 時間帯の予約単位。
// (例: 9:00-12:00 が 1 スロット、13:00-17:00 が次のスロット)
export const SlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/), // "HH:MM"
  end: z.string().regex(/^\d{2}:\d{2}$/),
  available: z.boolean(),
  // 公式予約システム上での参照キー (再予約画面に直接飛ぶ等に使う)。
  // adapter が出せなければ null。
  reservation_key: z.string().nullable().default(null),
  price_yen: z.number().int().nullable().default(null),
  note: z.string().nullable().default(null),
});
export type Slot = z.infer<typeof SlotSchema>;

export const GroundSchema = z.object({
  // (source, id) で一意になる安定 id。
  // 例: yokohama:港北区:岸根公園球技場
  id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().nullable().default(null),
  url: z.string().url().nullable().default(null),
});
export type Ground = z.infer<typeof GroundSchema>;

export const GroundAvailabilitySchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  scraped_at: z.string(), // ISO 8601
  source: z.string().min(1), // adapter id (mock, yokohama, ...)
  ground: GroundSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "YYYY-MM-DD"
  slots: z.array(SlotSchema),
});
export type GroundAvailability = z.infer<typeof GroundAvailabilitySchema>;

// `--list-sources --json` の出力。
export const SourceInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  implemented: z.boolean(),
  description: z.string(),
});
export type SourceInfo = z.infer<typeof SourceInfoSchema>;
