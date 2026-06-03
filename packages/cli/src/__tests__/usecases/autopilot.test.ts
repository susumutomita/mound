// autopilot のテスト。安全な手の自動実行と、拘束する手の提案据え置きを確認する。
import { describe, expect, it } from "vitest";
import type { GameStatus } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import { planAutopilot, runAutopilot } from "../../usecases/autopilot";
import { buildFakeContext } from "./memory-fakes";

// 実時計に依存しないよう now を固定して fake を作る。
function ctxAt(now: string): {
  ctx: UseCaseContext;
  stores: ReturnType<typeof buildFakeContext>["stores"];
} {
  return buildFakeContext(now);
}

async function seedTeam(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "T",
    home_area: null,
    created_at: "x",
    updated_at: "x",
  });
}

let gid = 0;
async function addGame(
  ctx: UseCaseContext,
  status: GameStatus,
  date: string | null,
): Promise<string> {
  const id = `g${++gid}`;
  await ctx.repo.games.insert({
    id,
    team_id: "t",
    title: `試合${id}`,
    status,
    game_date: date,
    ground_name: null,
    min_players: 1,
    note: null,
    created_at: "x",
    updated_at: "x",
  });
  return id;
}

describe("planAutopilot use case", () => {
  describe("各状態の試合が混在するとき", () => {
    it("DRAFT→PUBLISH(SAFE) / 過去CONFIRMED→COMPLETE(SAFE) / COMPLETED→精算リマインド(SAFE) を出す", async () => {
      const { ctx } = ctxAt("2026-06-10T00:00:00.000Z");
      await seedTeam(ctx);
      await addGame(ctx, "DRAFT", "2026-06-20");
      await addGame(ctx, "CONFIRMED", "2026-06-01"); // 過去 → 完了対象
      await addGame(ctx, "COMPLETED", "2026-06-01"); // 精算待ち

      const plan = await planAutopilot(ctx, { teamId: "t", horizonDays: 30 });
      const kinds = plan.actions.map((a) => a.kind);
      expect(kinds).toContain("PUBLISH");
      expect(kinds).toContain("COMPLETE");
      expect(kinds).toContain("REMIND_SETTLEMENT");
      expect(plan.actions.every((a) => a.risk === "SAFE")).toBe(true);
    });
  });

  describe("人数が充足した COLLECTING があるとき", () => {
    it("CONFIRM を NEEDS_APPROVAL として提案する", async () => {
      const { ctx } = ctxAt("2026-06-10T00:00:00.000Z");
      await seedTeam(ctx);
      await ctx.repo.members.insert({
        id: "m1",
        team_id: "t",
        name: "山田",
        email: null,
        role: "MEMBER",
        created_at: "x",
        updated_at: "x",
      });
      const g = await addGame(ctx, "COLLECTING", "2026-06-20"); // min_players=1
      await ctx.repo.rsvps.upsert({
        id: "r1",
        game_id: g,
        member_id: "m1",
        response: "AVAILABLE",
        responded_at: "x",
        created_at: "x",
        updated_at: "x",
      });
      const plan = await planAutopilot(ctx, { teamId: "t", horizonDays: 30 });
      const confirm = plan.actions.find((a) => a.kind === "CONFIRM");
      expect(confirm?.risk).toBe("NEEDS_APPROVAL");
    });
  });
});

describe("runAutopilot use case", () => {
  describe("--apply のとき", () => {
    it("SAFE な PUBLISH を実行し、CONFIRM は提案に据え置く", async () => {
      const { ctx, stores } = ctxAt("2026-06-10T00:00:00.000Z");
      await seedTeam(ctx);
      const draft = await addGame(ctx, "DRAFT", "2026-06-20");
      // 充足した COLLECTING (CONFIRM は要承認)
      await ctx.repo.members.insert({
        id: "m1",
        team_id: "t",
        name: "山田",
        email: null,
        role: "MEMBER",
        created_at: "x",
        updated_at: "x",
      });
      const g = await addGame(ctx, "COLLECTING", "2026-06-20");
      await ctx.repo.rsvps.upsert({
        id: "r1",
        game_id: g,
        member_id: "m1",
        response: "AVAILABLE",
        responded_at: "x",
        created_at: "x",
        updated_at: "x",
      });

      const result = await runAutopilot(ctx, {
        teamId: "t",
        horizonDays: 30,
        apply: true,
      });
      // PUBLISH が実行され、対象 DRAFT は COLLECTING になった
      expect(
        result.executed.some((e) => e.action.kind === "PUBLISH" && e.ok),
      ).toBe(true);
      expect(stores.games.get(draft)?.status).toBe("COLLECTING");
      // CONFIRM は実行せず提案のまま、対象は COLLECTING のまま
      expect(result.proposed.some((a) => a.kind === "CONFIRM")).toBe(true);
      expect(stores.games.get(g)?.status).toBe("COLLECTING");
    });
  });

  describe("dry-run (--apply なし) のとき", () => {
    it("何も実行せず全て proposed に入る", async () => {
      const { ctx, stores } = ctxAt("2026-06-10T00:00:00.000Z");
      await seedTeam(ctx);
      const draft = await addGame(ctx, "DRAFT", "2026-06-20");
      const result = await runAutopilot(ctx, {
        teamId: "t",
        horizonDays: 30,
        apply: false,
      });
      expect(result.executed).toHaveLength(0);
      expect(result.proposed.length).toBeGreaterThan(0);
      expect(stores.games.get(draft)?.status).toBe("DRAFT");
    });
  });
});
