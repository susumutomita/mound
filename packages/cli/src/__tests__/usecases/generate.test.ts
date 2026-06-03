// 月次の候補試合生成 (generateMonthlyGames) のテスト。
import { describe, expect, it } from "vitest";
import { WEEKDAY_CODES } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import { generateMonthlyGames } from "../../usecases/game";
import { recordKnowledge } from "../../usecases/knowledge";
import { buildFakeContext } from "./memory-fakes";

async function seedTeam(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "Xeros",
    home_area: "横浜",
    created_at: "x",
    updated_at: "x",
  });
}

const satIndex = WEEKDAY_CODES.indexOf("sat");
const isSat = (date: string): boolean =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === satIndex;

describe("generateMonthlyGames use case", () => {
  describe("default_weekday=sat の決め事があるとき", () => {
    it("その月の土曜分を DRAFT/ground_status=WANTED で生成し、既定の会場を使う", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await recordKnowledge(ctx, {
        teamId: "t",
        memberId: null,
        category: "PREFERENCE",
        key: "default_weekday",
        value: "sat",
        origin: "HUMAN",
        confidence: 1,
        source: null,
      });
      await recordKnowledge(ctx, {
        teamId: "t",
        memberId: null,
        category: "PREFERENCE",
        key: "default_ground",
        value: "三ツ沢公園野球場",
        origin: "HUMAN",
        confidence: 1,
        source: null,
      });

      const games = await generateMonthlyGames(ctx, {
        teamId: "t",
        month: "2026-07",
      });
      // 2026 年 7 月の土曜は 4 回 (4/11/18/25)。
      expect(games).toHaveLength(4);
      for (const g of games) {
        expect(g.status).toBe("DRAFT");
        expect(g.ground_status).toBe("WANTED");
        expect(g.ground_name).toBe("三ツ沢公園野球場");
        expect(g.game_date && isSat(g.game_date)).toBe(true);
      }
    });
  });

  describe("2 回実行したとき", () => {
    it("既存日付はスキップして重複しない (2 回目は 0 件)", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      const first = await generateMonthlyGames(ctx, {
        teamId: "t",
        month: "2026-07",
        weekday: "sat",
      });
      expect(first.length).toBeGreaterThan(0);
      const second = await generateMonthlyGames(ctx, {
        teamId: "t",
        month: "2026-07",
        weekday: "sat",
      });
      expect(second).toHaveLength(0);
    });
  });

  describe("曜日が決め事にも引数にも無いとき", () => {
    it("InvalidInputError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await expect(
        generateMonthlyGames(ctx, { teamId: "t", month: "2026-07" }),
      ).rejects.toThrow(/活動曜日が不明/);
    });
  });
});
