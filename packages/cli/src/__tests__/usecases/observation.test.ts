// Bronze 層 (生の観測) のテスト。追記専用・フィルタ・監査を確認する。
import { describe, expect, it } from "vitest";
import type { Team } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import {
  listObservations,
  recordObservation,
} from "../../usecases/observation";
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

describe("recordObservation use case", () => {
  describe("チームが存在するとき", () => {
    it("観測を追記し監査 OBSERVATION_RECORDED を残す", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      const obs = await recordObservation(ctx, {
        teamId: "t",
        kind: "ROSTER_FACT",
        body: "鈴木は隔週で来る",
        subject: null,
        memberId: null,
        source: "会話 2026-06-03",
      });
      expect(obs.kind).toBe("ROSTER_FACT");
      expect(obs.body).toBe("鈴木は隔週で来る");
      expect(stores.observations.get(obs.id)).toBeTruthy();
      expect(
        stores.audit.find((l) => l.action === "OBSERVATION_RECORDED"),
      ).toBeTruthy();
    });
  });

  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await expect(
        recordObservation(ctx, {
          teamId: "nope",
          kind: "NOTE",
          body: "x",
          subject: null,
          memberId: null,
          source: null,
        }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });

  describe("member 指定が別チームのとき", () => {
    it("MemberNotFoundError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await expect(
        recordObservation(ctx, {
          teamId: "t",
          kind: "ROSTER_FACT",
          body: "x",
          subject: null,
          memberId: "ghost",
          source: null,
        }),
      ).rejects.toThrow(/member が存在しません/);
    });
  });
});

describe("listObservations use case", () => {
  describe("kind フィルタを与えたとき", () => {
    it("一致する観測だけを返す", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await recordObservation(ctx, {
        teamId: "t",
        kind: "VENUE",
        body: "三ツ沢は取りやすい",
        subject: null,
        memberId: null,
        source: null,
      });
      await recordObservation(ctx, {
        teamId: "t",
        kind: "NOTE",
        body: "来季は人数増やす",
        subject: null,
        memberId: null,
        source: null,
      });
      const venues = await listObservations(ctx, {
        teamId: "t",
        kind: "VENUE",
      });
      expect(venues).toHaveLength(1);
      expect(venues[0]?.body).toBe("三ツ沢は取りやすい");
    });
  });
});
