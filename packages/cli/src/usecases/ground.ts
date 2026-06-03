import { z } from "zod";
import type { Game, GroundSlot } from "../domain/types";
import type {
  GroundSlotDiffFilter,
  GroundSlotFilter,
  GroundSlotPruneFilter,
  UseCaseContext,
} from "../ports";

// スクレイパが健全性チェックで出すダミー会場。実空きではないので取り込まない/掃除する。
export const TEST_FACILITY_MARKER = "動作確認";

// ground-reservation (susumutomita/ground-reservation) の `--json` 出力 schema。
// 破壊的変更が必要になったら schema_version を上げる。
// 参考: ground-reservation/app/availability/record.py
const AvailabilityRecordSchema = z.object({
  region: z.string().min(1),
  facility_name: z.string().min(1),
  date_raw: z.string(),
  date_iso: z.string().nullable(),
  time_range: z.string().nullable(),
  status: z.string().nullable(),
  raw: z.string(),
});

const RegionResultSchema = z.object({
  region: z.string().min(1),
  records: z.array(AvailabilityRecordSchema),
  errors: z.array(z.string()),
});

export const ScrapeOutputSchema = z.object({
  schema_version: z.number().int().positive(),
  scraped_at: z.string().min(1),
  regions: z.array(RegionResultSchema),
});

export type ScrapeOutput = z.infer<typeof ScrapeOutputSchema>;

export interface ImportGroundResult {
  scraped_at: string;
  total_records: number;
  inserted: number; // 新規 (first_seen_at が今回の取り込みと一致)
  updated: number; // 既存 (first_seen_at は前回以前)
  regions_with_errors: Array<{ region: string; errors: string[] }>;
}

function makeSlotKey(
  source: string,
  facility: string,
  dateIso: string | null,
  timeRange: string | null,
): string {
  // SQLite の UNIQUE は NULL を別々と扱うので、null をプレースホルダ文字に潰す。
  return [source, facility, dateIso ?? "", timeRange ?? ""].join("|");
}

export async function importGroundAvailability(
  ctx: UseCaseContext,
  payload: unknown,
): Promise<ImportGroundResult> {
  // 未知フィールドが増えても受けられるよう strict parse はせず、必要キーだけ検証。
  const data = ScrapeOutputSchema.parse(payload);
  const ingestedAt = ctx.now().toISOString();

  let inserted = 0;
  let updated = 0;
  let total = 0;
  const regionsWithErrors: Array<{ region: string; errors: string[] }> = [];

  for (const region of data.regions) {
    if (region.errors.length > 0) {
      regionsWithErrors.push({ region: region.region, errors: region.errors });
    }
    for (const rec of region.records) {
      // テスト用ダミー会場 (動作確認…) は取り込まない。
      if (rec.facility_name.includes(TEST_FACILITY_MARKER)) continue;
      total += 1;
      const slotKey = makeSlotKey(
        rec.region,
        rec.facility_name,
        rec.date_iso,
        rec.time_range,
      );
      const existing = await ctx.repo.groundSlots.getByKey(slotKey);
      const firstSeenAt = existing?.first_seen_at ?? ingestedAt;
      const slot: GroundSlot = {
        id: existing?.id ?? ctx.newId(),
        slot_key: slotKey,
        source: rec.region,
        facility_name: rec.facility_name,
        date_iso: rec.date_iso,
        date_raw: rec.date_raw,
        time_range: rec.time_range,
        status: rec.status,
        raw: rec.raw,
        scraped_at: data.scraped_at,
        first_seen_at: firstSeenAt,
        ingested_at: ingestedAt,
      };
      await ctx.repo.groundSlots.upsert(slot);
      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }
  }

  return {
    scraped_at: data.scraped_at,
    total_records: total,
    inserted,
    updated,
    regions_with_errors: regionsWithErrors,
  };
}

export async function listGroundSlots(
  ctx: UseCaseContext,
  filter: GroundSlotFilter,
): Promise<GroundSlot[]> {
  return ctx.repo.groundSlots.list(filter);
}

// 過去日 / 古い取得 / テストデータを物理削除して、削除件数を返す。
export async function pruneGroundSlots(
  ctx: UseCaseContext,
  filter: GroundSlotPruneFilter,
): Promise<number> {
  return ctx.repo.groundSlots.prune(filter);
}

// 「直近キャンセル候補」を返す: first_seen_at >= since の slot を抽出する。
// 連続スクレイプで初めて観測された枠 = 誰かがキャンセルして空いた可能性が高い。
// since は ISO8601 (例: "2026-05-22T09:00:00.000Z")。
export async function detectNewSlots(
  ctx: UseCaseContext,
  filter: GroundSlotDiffFilter,
): Promise<GroundSlot[]> {
  return ctx.repo.groundSlots.listNewerThan(filter);
}

// 指定 game の game_date と ground_name に整合する ground_slots を返す。
// マッチング規則:
//   - game.game_date / game.ground_name のどちらか欠けたら空配列
//   - 同日 (date_iso === game.game_date) かつ
//     facility_name に game.ground_name を部分文字列として含む slot
// substring 一致は表記揺れには弱いが、Phase 1 では "公園" と打てば
// "三ツ沢公園球技場" まで拾える緩めの挙動を狙う。
export async function findSlotsMatchingGame(
  ctx: UseCaseContext,
  game: Game,
): Promise<GroundSlot[]> {
  if (!game.game_date || !game.ground_name) return [];
  const slots = await ctx.repo.groundSlots.list({ dateIso: game.game_date });
  const needle = game.ground_name;
  return slots.filter((s) => s.facility_name.includes(needle));
}
