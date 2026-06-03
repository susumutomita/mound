// view (ダッシュボード) のデータ集計テスト。UI 生成の土台が正しく集まるか。
import { describe, expect, it } from "vitest";
import type { UseCaseContext } from "../../ports";
import { buildDashboard } from "../../usecases/dashboard";
import { buildFakeContext } from "./memory-fakes";

async function seed(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "Xeros",
    home_area: "横浜",
    created_at: "x",
    updated_at: "x",
  });
  await ctx.repo.members.insert({
    id: "m1",
    team_id: "t",
    name: "トミー",
    email: null,
    role: "MEMBER",
    created_at: "x",
    updated_at: "x",
  });
  await ctx.repo.games.insert({
    id: "g",
    team_id: "t",
    title: "練習試合",
    status: "COLLECTING",
    game_date: "2026-06-06",
    ground_name: "岡村公園",
    ground_status: "SECURED",
    min_players: 9,
    note: null,
    created_at: "x",
    updated_at: "x",
  });
  // CANCELLED は出さない
  await ctx.repo.games.insert({
    id: "x",
    team_id: "t",
    title: "中止試合",
    status: "CANCELLED",
    game_date: "2026-06-07",
    ground_name: null,
    ground_status: null,
    min_players: 9,
    note: null,
    created_at: "x",
    updated_at: "x",
  });
}

describe("buildDashboard use case", () => {
  describe("進行中の試合があるとき", () => {
    it("team / agenda / games(出欠込み) / 空き / 決め事を 1 度に集める", async () => {
      const { ctx } = buildFakeContext("2026-06-03T09:00:00.000Z");
      await seed(ctx);
      const d = await buildDashboard(ctx, { teamId: "t", horizonDays: 14 });

      expect(d.team.name).toBe("Xeros");
      expect(d.agenda).toBeDefined();
      // CANCELLED は除外、COLLECTING の練習試合だけ
      expect(d.games).toHaveLength(1);
      const g = d.games[0];
      expect(g?.game.title).toBe("練習試合");
      expect(g?.game.ground_status).toBe("SECURED");
      expect(g?.no_response).toBe(1); // トミー未回答
      expect(g?.shortage).toBe(9); // 参加可 0 / min 9
    });
  });

  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        buildDashboard(ctx, { teamId: "nope", horizonDays: 14 }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });
});
