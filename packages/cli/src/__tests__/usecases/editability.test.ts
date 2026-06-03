// チーム/メンバーの編集 (改名・本拠地変更・削除) のテスト。
import { describe, expect, it } from "vitest";
import type { GameStatus } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import { updateGame } from "../../usecases/game";
import { removeMember, updateMember } from "../../usecases/member";
import { removeTeam, showTeam, updateTeam } from "../../usecases/team";
import { buildFakeContext } from "./memory-fakes";

async function seedTeam(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "Xeros",
    home_area: null,
    created_at: "x",
    updated_at: "x",
  });
}

async function seedMember(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.members.insert({
    id: "m",
    team_id: "t",
    name: "冨田進",
    email: null,
    role: "MEMBER",
    created_at: "x",
    updated_at: "x",
  });
}

describe("updateTeam use case", () => {
  describe("本拠地を後から設定するとき", () => {
    it("home_area を更新し監査 TEAM_UPDATED を残す", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      const updated = await updateTeam(ctx, { teamId: "t", homeArea: "横浜" });
      expect(updated.home_area).toBe("横浜");
      expect(updated.name).toBe("Xeros"); // 未指定は据え置き
      expect(stores.audit.some((l) => l.action === "TEAM_UPDATED")).toBe(true);
    });
  });

  describe("存在しないチームのとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        updateTeam(ctx, { teamId: "nope", name: "X" }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });
});

describe("updateMember use case", () => {
  describe("本名からニックネームへ改名するとき", () => {
    it("name を更新する (本名は不要)", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await seedMember(ctx);
      const updated = await updateMember(ctx, {
        memberId: "m",
        name: "トミー",
      });
      expect(updated.name).toBe("トミー");
      expect(updated.role).toBe("MEMBER"); // 未指定は据え置き
    });
  });

  describe("存在しないメンバーのとき", () => {
    it("MemberNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        updateMember(ctx, { memberId: "ghost", name: "X" }),
      ).rejects.toThrow(/member が存在しません/);
    });
  });
});

describe("removeMember use case", () => {
  describe("既存メンバーのとき", () => {
    it("削除して true を返し、2 回目は false", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      await seedMember(ctx);
      expect(await removeMember(ctx, "m")).toBe(true);
      expect(stores.members.has("m")).toBe(false);
      expect(stores.audit.some((l) => l.action === "MEMBER_REMOVED")).toBe(
        true,
      );
      expect(await removeMember(ctx, "m")).toBe(false);
    });
  });
});

describe("showTeam use case", () => {
  describe("メンバーと決め事があるとき", () => {
    it("team + members + knowledge をまとめて返す", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await seedMember(ctx);
      await ctx.repo.knowledge.insert({
        id: "k",
        team_id: "t",
        member_id: null,
        category: "PREFERENCE",
        key: "default_weekday",
        value: "sat",
        origin: "HUMAN",
        confidence: 1,
        evidence_count: 1,
        source: null,
        last_observed_at: null,
        created_at: "x",
        updated_at: "x",
      });
      const profile = await showTeam(ctx, "t");
      expect(profile.team.name).toBe("Xeros");
      expect(profile.members).toHaveLength(1);
      expect(profile.knowledge).toHaveLength(1);
    });
  });
});

describe("removeTeam use case", () => {
  describe("既存チームのとき", () => {
    it("削除して true を返し監査 TEAM_REMOVED を残す", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      expect(await removeTeam(ctx, "t")).toBe(true);
      expect(stores.teams.has("t")).toBe(false);
      expect(stores.audit.some((l) => l.action === "TEAM_REMOVED")).toBe(true);
      expect(await removeTeam(ctx, "t")).toBe(false);
    });
  });
});

describe("updateGame use case", () => {
  describe("既存 game の note と日付を後から更新するとき", () => {
    it("該当フィールドだけ更新する (AGENTS.md §9 の note 後更新)", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await ctx.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "練習試合",
        status: "DRAFT" as GameStatus,
        game_date: null,
        ground_name: null,
        ground_status: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      const updated = await updateGame(ctx, {
        gameId: "g",
        date: "2026-06-20",
        note: "対戦相手は連絡待ち",
      });
      expect(updated.game_date).toBe("2026-06-20");
      expect(updated.note).toBe("対戦相手は連絡待ち");
      expect(updated.title).toBe("練習試合"); // 未指定は据え置き
    });
  });
});
