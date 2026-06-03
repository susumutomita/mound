// Gold 層 (チームの決め事) のテスト。「使うほど賢くなる」マージ規則を網羅する。
import { describe, expect, it } from "vitest";
import type { Member, Team } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import {
  forgetKnowledge,
  getTeamPreferences,
  recordKnowledge,
} from "../../usecases/knowledge";
import { buildFakeContext } from "./memory-fakes";

async function seedTeam(ctx: UseCaseContext): Promise<Team> {
  return ctx.repo.teams.insert({
    id: "t",
    name: "横浜BB",
    home_area: "横浜",
    created_at: "x",
    updated_at: "x",
  });
}

async function seedMember(
  ctx: UseCaseContext,
  teamId: string,
): Promise<Member> {
  return ctx.repo.members.insert({
    id: "m",
    team_id: teamId,
    name: "鈴木",
    email: null,
    role: "MEMBER",
    created_at: "x",
    updated_at: "x",
  });
}

const base = {
  category: "PREFERENCE" as const,
  memberId: null,
  source: null,
};

describe("recordKnowledge use case", () => {
  describe("新規キーのとき", () => {
    it("INSERT し evidence_count=1 と監査 KNOWLEDGE_SET を残す", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      const entry = await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_ground",
        value: "三ツ沢公園野球場",
        origin: "HUMAN",
        confidence: 1,
      });
      expect(entry.value).toBe("三ツ沢公園野球場");
      expect(entry.evidence_count).toBe(1);
      expect(entry.origin).toBe("HUMAN");
      expect(
        stores.audit.find((l) => l.action === "KNOWLEDGE_SET"),
      ).toBeTruthy();
    });
  });

  describe("人の決め事 (HUMAN) に学習値 (LEARNED) が来たとき", () => {
    it("値は上書きされずピン留めされるが evidence_count は加算される", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_ground",
        value: "三ツ沢公園野球場",
        origin: "HUMAN",
        confidence: 1,
      });
      const updated = await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_ground",
        value: "別の会場",
        origin: "LEARNED",
        confidence: 0.4,
      });
      expect(updated.value).toBe("三ツ沢公園野球場"); // ピン留め
      expect(updated.origin).toBe("HUMAN");
      expect(updated.confidence).toBe(1);
      expect(updated.evidence_count).toBe(2); // 裏付けは厚くなる
      expect(
        stores.audit.find((l) => l.action === "KNOWLEDGE_UPDATED"),
      ).toBeTruthy();
    });
  });

  describe("学習値 (LEARNED) 同士のとき", () => {
    it("confidence が高い方が値を握り、低い再観測では据え置く", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_weekday",
        value: "sat",
        origin: "LEARNED",
        confidence: 0.5,
      });
      const higher = await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_weekday",
        value: "sun",
        origin: "LEARNED",
        confidence: 0.7,
      });
      expect(higher.value).toBe("sun");
      expect(higher.confidence).toBe(0.7);
      expect(higher.evidence_count).toBe(2);

      const lower = await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_weekday",
        value: "mon",
        origin: "LEARNED",
        confidence: 0.6,
      });
      expect(lower.value).toBe("sun"); // 据え置き
      expect(lower.confidence).toBe(0.7);
      expect(lower.evidence_count).toBe(3);
    });
  });

  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        recordKnowledge(ctx, {
          ...base,
          teamId: "nope",
          key: "k",
          value: "v",
          origin: "HUMAN",
          confidence: 1,
        }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });

  describe("member 指定が別チームのとき", () => {
    it("MemberNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await expect(
        recordKnowledge(ctx, {
          ...base,
          teamId: "t",
          memberId: "ghost",
          key: "position",
          value: "P",
          origin: "HUMAN",
          confidence: 1,
        }),
      ).rejects.toThrow(/member が存在しません/);
    });
  });

  describe("メンバー固有の決め事のとき", () => {
    it("同じ key でもチーム既定値とは別行として共存する", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await seedMember(ctx, "t");
      await recordKnowledge(ctx, {
        ...base,
        category: "ROSTER",
        teamId: "t",
        memberId: "m",
        key: "note",
        value: "隔週で来る",
        origin: "HUMAN",
        confidence: 1,
      });
      const teamLevel = await recordKnowledge(ctx, {
        ...base,
        category: "NOTE",
        teamId: "t",
        memberId: null,
        key: "note",
        value: "連絡網は LINE",
        origin: "HUMAN",
        confidence: 1,
      });
      expect(teamLevel.evidence_count).toBe(1); // 別行なので初回扱い
    });
  });
});

describe("getTeamPreferences use case", () => {
  describe("PREFERENCE とそれ以外が混在するとき", () => {
    it("category=PREFERENCE かつメンバー非依存の決め事だけを返す", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await seedMember(ctx, "t");
      await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "default_ground",
        value: "三ツ沢",
        origin: "HUMAN",
        confidence: 1,
      });
      await recordKnowledge(ctx, {
        ...base,
        category: "RULE",
        teamId: "t",
        key: "fee",
        value: "500",
        origin: "HUMAN",
        confidence: 1,
      });
      await recordKnowledge(ctx, {
        ...base,
        category: "PREFERENCE",
        teamId: "t",
        memberId: "m",
        key: "default_ground",
        value: "個人用",
        origin: "HUMAN",
        confidence: 1,
      });
      const prefs = await getTeamPreferences(ctx, "t");
      expect(prefs).toEqual([
        {
          key: "default_ground",
          value: "三ツ沢",
          confidence: 1,
          origin: "HUMAN",
        },
      ]);
    });
  });
});

describe("forgetKnowledge use case", () => {
  describe("既存 ID を渡したとき", () => {
    it("削除して true を返す", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      const entry = await recordKnowledge(ctx, {
        ...base,
        teamId: "t",
        key: "k",
        value: "v",
        origin: "HUMAN",
        confidence: 1,
      });
      expect(await forgetKnowledge(ctx, entry.id)).toBe(true);
      expect(await forgetKnowledge(ctx, entry.id)).toBe(false);
    });
  });
});
