// 精算 (PayPay 割り勘) のテスト。割り勘計算・未払い把握・全額消し込みで自動 SETTLED を確認する。
import { describe, expect, it } from "vitest";
import type { GameStatus } from "../../domain/types";
import type { UseCaseContext } from "../../ports";
import {
  createSettlement,
  getSettlement,
  markPaid,
  splitEvenly,
} from "../../usecases/settlement";
import { buildFakeContext } from "./memory-fakes";

async function seedTeam(ctx: UseCaseContext): Promise<void> {
  await ctx.repo.teams.insert({
    id: "t",
    name: "T",
    home_area: null,
    created_at: "x",
    updated_at: "x",
  });
}

async function addGame(
  ctx: UseCaseContext,
  status: GameStatus = "COMPLETED",
): Promise<string> {
  await ctx.repo.games.insert({
    id: "g",
    team_id: "t",
    title: "練習試合",
    status,
    game_date: "2026-06-01",
    ground_name: "三ツ沢",
    min_players: 1,
    note: null,
    created_at: "x",
    updated_at: "x",
  });
  return "g";
}

async function addMemberWithRsvp(
  ctx: UseCaseContext,
  id: string,
  response: "AVAILABLE" | "UNAVAILABLE",
): Promise<void> {
  await ctx.repo.members.insert({
    id,
    team_id: "t",
    name: id,
    email: null,
    role: "MEMBER",
    created_at: "x",
    updated_at: "x",
  });
  await ctx.repo.rsvps.upsert({
    id: `g:${id}`,
    game_id: "g",
    member_id: id,
    response,
    responded_at: "x",
    created_at: "x",
    updated_at: "x",
  });
}

describe("splitEvenly", () => {
  describe("割り切れないとき", () => {
    it("端数を先頭から 1 円ずつ載せて合計を一致させる", () => {
      const parts = splitEvenly(1000, 3);
      expect(parts).toEqual([334, 333, 333]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    });
  });
});

describe("createSettlement use case", () => {
  describe("AVAILABLE の参加者がいるとき", () => {
    it("AVAILABLE のメンバーで割り勘し share を作る", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx);
      await addMemberWithRsvp(ctx, "m1", "AVAILABLE");
      await addMemberWithRsvp(ctx, "m2", "AVAILABLE");
      await addMemberWithRsvp(ctx, "m3", "UNAVAILABLE"); // 不参加は割り勘に入らない

      await createSettlement(ctx, {
        gameId: "g",
        totalAmount: 3000,
        paymentLink: "https://pay.paypay.ne.jp/xxxx",
        paymentLabel: "PayPay: 田中宛",
        note: null,
        participantMemberIds: null,
      });
      const view = await getSettlement(ctx, "g");
      expect(view?.summary.participants).toBe(2);
      expect(view?.shares.map((s) => s.amount)).toEqual([1500, 1500]);
      expect(view?.summary.outstanding).toBe(3000);
    });
  });

  describe("参加者がいないとき", () => {
    it("SettlementError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx);
      await expect(
        createSettlement(ctx, {
          gameId: "g",
          totalAmount: 3000,
          paymentLink: null,
          paymentLabel: null,
          note: null,
          participantMemberIds: null,
        }),
      ).rejects.toThrow(/参加者がいません/);
    });
  });

  describe("既に精算があるとき", () => {
    it("二重作成を SettlementError で拒否する", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx);
      await addMemberWithRsvp(ctx, "m1", "AVAILABLE");
      const input = {
        gameId: "g",
        totalAmount: 1000,
        paymentLink: null,
        paymentLabel: null,
        note: null,
        participantMemberIds: null,
      };
      await createSettlement(ctx, input);
      await expect(createSettlement(ctx, input)).rejects.toThrow(/既に存在/);
    });
  });
});

describe("markPaid use case", () => {
  describe("全員が支払ったとき", () => {
    it("settlement=SETTLED になり COMPLETED の試合も SETTLED へ進む", async () => {
      const { ctx, stores } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx, "COMPLETED");
      await addMemberWithRsvp(ctx, "m1", "AVAILABLE");
      await addMemberWithRsvp(ctx, "m2", "AVAILABLE");
      await createSettlement(ctx, {
        gameId: "g",
        totalAmount: 2000,
        paymentLink: null,
        paymentLabel: null,
        note: null,
        participantMemberIds: null,
      });

      await markPaid(ctx, { gameId: "g", memberId: "m1", paid: true });
      const mid = await getSettlement(ctx, "g");
      expect(mid?.settlement.status).toBe("OPEN"); // まだ 1 人

      const view = await markPaid(ctx, {
        gameId: "g",
        memberId: "m2",
        paid: true,
      });
      expect(view.settlement.status).toBe("SETTLED");
      expect(view.summary.outstanding).toBe(0);
      expect(stores.games.get("g")?.status).toBe("SETTLED");
    });
  });

  describe("精算が無い試合のとき", () => {
    it("SettlementError を投げる", async () => {
      const { ctx } = buildFakeContext();
      await seedTeam(ctx);
      await addGame(ctx);
      await expect(
        markPaid(ctx, { gameId: "g", memberId: "m1", paid: true }),
      ).rejects.toThrow(/精算がありません/);
    });
  });
});
