// ground_slots の鮮度フィルタ / prune / テストデータ除外のテスト。
// 古い・過去・テスト (動作確認) を既定で出さないことを確かめる。
import { describe, expect, it } from "vitest";
import type { GroundSlot } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import {
  importGroundAvailability,
  listGroundSlots,
  pruneGroundSlots,
} from "../../usecases/ground";
import { buildFakeContext } from "./memory-fakes";

function slot(over: Partial<GroundSlot>): GroundSlot {
  return {
    id: over.slot_key ?? "s",
    slot_key: over.slot_key ?? "s",
    source: "yokohama",
    facility_name: "岡村公園",
    date_iso: "2026-07-04",
    date_raw: "x",
    time_range: "11:00-13:00",
    status: "空き",
    raw: "",
    scraped_at: "x",
    first_seen_at: "x",
    ingested_at: "2026-06-03T00:00:00.000Z",
    ...over,
  };
}

async function seed(ctx: UseCaseContext): Promise<void> {
  // 直近取得・未来日 (= 出すべき)
  await ctx.repo.groundSlots.upsert(
    slot({
      slot_key: "fresh",
      date_iso: "2026-06-06",
      ingested_at: "2026-06-03T07:00:00.000Z",
    }),
  );
  // 過去日 (= 隠す)
  await ctx.repo.groundSlots.upsert(
    slot({
      slot_key: "past",
      date_iso: "2026-05-23",
      ingested_at: "2026-06-03T07:00:00.000Z",
    }),
  );
  // 古い取得 (= 隠す)
  await ctx.repo.groundSlots.upsert(
    slot({
      slot_key: "stale",
      date_iso: "2026-07-04",
      ingested_at: "2026-05-22T11:00:00.000Z",
    }),
  );
  // テストデータ (= 隠す/掃除)
  await ctx.repo.groundSlots.upsert(
    slot({
      slot_key: "test",
      facility_name: "動作確認球場",
      ingested_at: "2026-05-22T11:00:00.000Z",
    }),
  );
}

const TODAY = "2026-06-03";
const FRESH_SINCE = "2026-06-01T00:00:00.000Z"; // 48h 窓相当

describe("listGroundSlots の鮮度/未来フィルタ", () => {
  describe("今日以降 × 直近取得で絞るとき", () => {
    it("過去日・古い取得・テストを除外して直近の空きだけ返す", async () => {
      const { ctx } = buildFakeContext();
      await seed(ctx);
      const slots = await listGroundSlots(ctx, {
        sinceDate: TODAY,
        ingestedSince: FRESH_SINCE,
      });
      expect(slots.map((s) => s.slot_key)).toEqual(["fresh"]);
    });
  });

  describe("フィルタ無し (--all 相当) のとき", () => {
    it("全件返す", async () => {
      const { ctx } = buildFakeContext();
      await seed(ctx);
      const slots = await listGroundSlots(ctx, {});
      expect(slots).toHaveLength(4);
    });
  });
});

describe("pruneGroundSlots", () => {
  describe("過去日 + 古い取得 + テストを掃除するとき", () => {
    it("該当を削除し、直近の空きだけ残る", async () => {
      const { ctx } = buildFakeContext();
      await seed(ctx);
      const deleted = await pruneGroundSlots(ctx, {
        beforeDate: TODAY,
        ingestedBefore: FRESH_SINCE,
      });
      expect(deleted).toBe(3); // past + stale + test
      const remaining = await listGroundSlots(ctx, {});
      expect(remaining.map((s) => s.slot_key)).toEqual(["fresh"]);
    });
  });
});

describe("importGroundAvailability のテストデータ除外", () => {
  describe("動作確認会場が混ざっているとき", () => {
    it("取り込まない", async () => {
      const { ctx } = buildFakeContext();
      const result = await importGroundAvailability(ctx, {
        schema_version: 1,
        scraped_at: "2026-06-03T07:00:00.000Z",
        regions: [
          {
            region: "yokohama",
            errors: [],
            records: [
              {
                region: "yokohama",
                facility_name: "岡村公園",
                date_raw: "x",
                date_iso: "2026-06-06",
                time_range: "11:00-13:00",
                status: "空き",
                raw: "",
              },
              {
                region: "yokohama",
                facility_name: "動作確認球場",
                date_raw: "x",
                date_iso: "2026-07-01",
                time_range: "09:00-12:00",
                status: "",
                raw: "",
              },
            ],
          },
        ],
      });
      expect(result.total_records).toBe(1); // 動作確認は除外
      const slots = await listGroundSlots(ctx, {});
      expect(slots.map((s) => s.facility_name)).toEqual(["岡村公園"]);
    });
  });
});
