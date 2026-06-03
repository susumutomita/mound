// Silver→Gold 学習エンジンのテスト。履歴からの導出と、人の決め事ピン留めを確認する。
import { describe, expect, it } from "vitest";
import type { GameStatus } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import { recordKnowledge } from "../../usecases/knowledge";
import { computeLearnedFacts, learnTeam } from "../../usecases/learn";
import { buildFakeContext } from "./memory-fakes";

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function seedTeam(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "横浜BB",
    home_area: "横浜",
    created_at: "x",
    updated_at: "x",
  });
}

let gid = 0;
async function addGame(
  ctx: UseCaseContext,
  date: string | null,
  ground: string | null,
  status: GameStatus = "COMPLETED",
): Promise<string> {
  const id = `g${++gid}`;
  await ctx.repo.games.insert({
    id,
    team_id: "t",
    title: "試合",
    status,
    game_date: date,
    ground_name: ground,
    min_players: 9,
    note: null,
    created_at: "x",
    updated_at: "x",
  });
  return id;
}

async function addMember(ctx: UseCaseContext, id: string): Promise<void> {
  await ctx.repo.members.insert({
    id,
    team_id: "t",
    name: id,
    email: null,
    role: "MEMBER",
    created_at: "x",
    updated_at: "x",
  });
}

describe("computeLearnedFacts use case", () => {
  describe("会場と曜日に偏りがあるとき", () => {
    it("default_ground と default_weekday を最頻値で導出する", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      // 2026-06-06 と 2026-06-13 は土曜
      await addGame(ctx, "2026-06-06", "三ツ沢公園野球場");
      await addGame(ctx, "2026-06-13", "三ツ沢公園野球場");
      await addGame(ctx, "2026-06-07", "岸根公園"); // 日曜・別会場

      const facts = await computeLearnedFacts(ctx, "t");
      const ground = facts.find((f) => f.key === "default_ground");
      const weekday = facts.find((f) => f.key === "default_weekday");
      expect(ground?.value).toBe("三ツ沢公園野球場");
      expect(ground?.evidence_count).toBe(2);
      expect(ground?.confidence).toBe(round2(2 / 3));
      expect(weekday?.value).toBe("sat");
    });
  });

  describe("裏付けが 1 件しかないとき", () => {
    it("「いつもの」とは見なさず導出しない", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx, "2026-06-06", "三ツ沢公園野球場");
      const facts = await computeLearnedFacts(ctx, "t");
      expect(facts.find((f) => f.key === "default_ground")).toBeUndefined();
    });
  });

  describe("メンバーの出欠履歴があるとき", () => {
    it("出席率を導出する (回答試合のうち AVAILABLE の割合)", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addMember(ctx, "m1");
      const g1 = await addGame(ctx, "2026-06-06", "三ツ沢");
      const g2 = await addGame(ctx, "2026-06-13", "三ツ沢");
      for (const [g, resp] of [
        [g1, "AVAILABLE"],
        [g2, "UNAVAILABLE"],
      ] as const) {
        await ctx.repo.rsvps.upsert({
          id: `${g}:m1`,
          game_id: g,
          member_id: "m1",
          response: resp,
          responded_at: "x",
          created_at: "x",
          updated_at: "x",
        });
      }
      const facts = await computeLearnedFacts(ctx, "t");
      const att = facts.find((f) => f.member_id === "m1");
      expect(att?.value).toBe("0.5 (1/2)");
      expect(att?.evidence_count).toBe(2);
    });
  });
});

describe("learnTeam use case", () => {
  describe("--apply のとき", () => {
    it("学習値を Gold に書き、人の決め事 (HUMAN) はピン留めしてスキップする", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      // 人が default_ground を明示済み
      await recordKnowledge(ctx, {
        teamId: "t",
        memberId: null,
        category: "PREFERENCE",
        key: "default_ground",
        value: "市営球場",
        origin: "HUMAN",
        confidence: 1,
        source: null,
      });
      // 履歴上は三ツ沢が最頻
      await addGame(ctx, "2026-06-06", "三ツ沢公園野球場");
      await addGame(ctx, "2026-06-13", "三ツ沢公園野球場");

      const result = await learnTeam(ctx, { teamId: "t", apply: true });
      expect(result.applied).toBe(true);
      expect(result.pinned_skips).toContain("default_ground");
      // Gold の値は人の決め事のまま (学習で上書きされない)
      const stored = Array.from(stores.knowledge.values()).find(
        (k) => k.key === "default_ground",
      );
      expect(stored?.value).toBe("市営球場");
      expect(stored?.origin).toBe("HUMAN");
    });
  });

  describe("dry-run (--apply なし) のとき", () => {
    it("Gold には書かず提案だけ返す", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx, "2026-06-06", "三ツ沢");
      await addGame(ctx, "2026-06-13", "三ツ沢");
      const result = await learnTeam(ctx, { teamId: "t", apply: false });
      expect(result.applied).toBe(false);
      expect(result.facts.length).toBeGreaterThan(0);
      expect(stores.knowledge.size).toBe(0);
    });
  });

  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        learnTeam(ctx, { teamId: "nope", apply: false }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });
});
