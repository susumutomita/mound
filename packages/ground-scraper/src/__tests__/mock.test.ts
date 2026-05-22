import { describe, expect, it } from "vitest";
import { listMockGrounds, scrapeMock } from "../adapters/mock";
import {
  type GroundAvailability,
  GroundAvailabilitySchema,
  SCHEMA_VERSION,
} from "../types";

const FROZEN_NOW = new Date("2026-05-20T09:00:00.000Z");

describe("mock adapter", () => {
  describe("全グラウンドのとき", () => {
    it("listMockGrounds と同数の GroundAvailability を返す", () => {
      const rows = scrapeMock({ date: "2026-06-01", now: FROZEN_NOW });
      expect(rows.length).toBe(listMockGrounds().length);
    });

    it("各 row が schema を満たす", () => {
      const rows = scrapeMock({ date: "2026-06-01", now: FROZEN_NOW });
      for (const r of rows) {
        const parsed = GroundAvailabilitySchema.safeParse(r);
        expect(parsed.success).toBe(true);
        expect(r.schema_version).toBe(SCHEMA_VERSION);
        expect(r.source).toBe("mock");
        expect(r.date).toBe("2026-06-01");
        expect(r.scraped_at).toBe(FROZEN_NOW.toISOString());
        expect(r.slots.length).toBeGreaterThan(0);
      }
    });

    it("available の分布は決定論的 (同じ入力で同じ結果)", () => {
      const a = scrapeMock({ date: "2026-06-01", now: FROZEN_NOW });
      const b = scrapeMock({ date: "2026-06-01", now: FROZEN_NOW });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("日付が違えば slots の available パターンが変わる", () => {
      const day1 = scrapeMock({ date: "2026-06-01", now: FROZEN_NOW });
      const day2 = scrapeMock({ date: "2026-06-02", now: FROZEN_NOW });
      const same = (a: GroundAvailability[], b: GroundAvailability[]) =>
        JSON.stringify(a.map((r) => r.slots)) ===
        JSON.stringify(b.map((r) => r.slots));
      expect(same(day1, day2)).toBe(false);
    });
  });

  describe("ground 指定のとき", () => {
    it("該当 1 件だけ返す", () => {
      const id = listMockGrounds()[0]?.id as string;
      const rows = scrapeMock({
        date: "2026-06-01",
        groundId: id,
        now: FROZEN_NOW,
      });
      expect(rows.length).toBe(1);
      expect(rows[0]?.ground.id).toBe(id);
    });

    it("存在しない id だと throw する", () => {
      expect(() =>
        scrapeMock({
          date: "2026-06-01",
          groundId: "non-existent",
          now: FROZEN_NOW,
        }),
      ).toThrow(/該当 ground が無い/);
    });
  });
});
