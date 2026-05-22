import { z } from "zod";
import type { GroundSlot } from "../domain/types";
import type {
  GroundSlotDiffFilter,
  GroundSlotFilter,
  UseCaseContext,
} from "../ports";

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

// 「直近キャンセル候補」を返す: first_seen_at >= since の slot を抽出する。
// 連続スクレイプで初めて観測された枠 = 誰かがキャンセルして空いた可能性が高い。
// since は ISO8601 (例: "2026-05-22T09:00:00.000Z")。
export async function detectNewSlots(
  ctx: UseCaseContext,
  filter: GroundSlotDiffFilter,
): Promise<GroundSlot[]> {
  return ctx.repo.groundSlots.listNewerThan(filter);
}
