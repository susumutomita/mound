// チーム/メンバーの編集 (改名・本拠地変更・削除) のテスト。
import { describe, expect, it } from "vitest";
import type { UseCaseContext } from "../../ports";
import { removeMember, updateMember } from "../../usecases/member";
import { updateTeam } from "../../usecases/team";
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
