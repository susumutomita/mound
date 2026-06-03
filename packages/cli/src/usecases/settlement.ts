// 精算 (PayPay 割り勘)。試合の会場費等を参加者で割り勘し、PayPay リンクを貼って
// 催促・消し込みする。全員払ったら settlement は SETTLED になり、game (COMPLETED) も
// SETTLED へ進む。PayPay 個人割り勘に公開 API は無いため、リンクは人が貼り入金は人が
// 消し込む。mound は「割り勘額の計算・未払いの把握・催促文の生成・精算完了の自動遷移」を担う。
import type { Settlement, SettlementShare } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { GameNotFoundError, SettlementError } from "./errors";
import { transitionGame } from "./game";

// 合計を人数で割り勘する。端数は先頭から 1 円ずつ上乗せして合計を一致させる。
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface CreateSettlementInput {
  gameId: string;
  totalAmount: number;
  paymentLink: string | null;
  paymentLabel: string | null;
  note: string | null;
  // 参加者を明示する場合。未指定なら RSVP が AVAILABLE のメンバーで割り勘する。
  participantMemberIds: string[] | null;
}

export async function createSettlement(
  ctx: UseCaseContext,
  input: CreateSettlementInput,
): Promise<Settlement> {
  const game = await ctx.repo.games.get(input.gameId);
  if (!game) throw new GameNotFoundError(input.gameId);
  if (input.totalAmount <= 0) {
    throw new SettlementError("合計金額は 1 円以上にしてください");
  }
  const existing = await ctx.repo.settlements.getByGame(game.id);
  if (existing) {
    throw new SettlementError(`この試合の精算は既に存在します: ${existing.id}`);
  }

  let memberIds = input.participantMemberIds;
  if (!memberIds) {
    const rows = await ctx.repo.rsvps.listWithMembers(game.id, game.team_id);
    memberIds = rows
      .filter((r) => r.response === "AVAILABLE")
      .map((r) => r.member_id);
  }
  if (memberIds.length === 0) {
    throw new SettlementError(
      "割り勘の参加者がいません (AVAILABLE の出欠が無いか、--member を指定してください)",
    );
  }

  const now = ctx.now().toISOString();
  const settlement: Settlement = {
    id: ctx.newId(),
    game_id: game.id,
    team_id: game.team_id,
    total_amount: input.totalAmount,
    payment_link: input.paymentLink,
    payment_label: input.paymentLabel,
    note: input.note,
    status: "OPEN",
    created_at: now,
    updated_at: now,
  };
  await ctx.repo.settlements.insert(settlement);

  const amounts = splitEvenly(input.totalAmount, memberIds.length);
  for (let i = 0; i < memberIds.length; i++) {
    await ctx.repo.settlements.insertShare({
      id: ctx.newId(),
      settlement_id: settlement.id,
      member_id: memberIds[i] as string,
      amount: amounts[i] as number,
      paid: false,
      paid_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  await writeAuditLog(ctx, {
    action: "SETTLEMENT_CREATED",
    targetType: "settlement",
    targetId: settlement.id,
    after: settlement,
  });
  return settlement;
}

export interface SettlementShareView extends SettlementShare {
  member_name: string;
}

export interface SettlementView {
  settlement: Settlement;
  shares: SettlementShareView[];
  summary: {
    participants: number;
    paid_count: number;
    unpaid_count: number;
    collected: number;
    outstanding: number;
    total: number;
  };
}

async function buildView(
  ctx: UseCaseContext,
  settlement: Settlement,
): Promise<SettlementView> {
  const shares = await ctx.repo.settlements.listShares(settlement.id);
  const members = await ctx.repo.members.list(settlement.team_id);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const views: SettlementShareView[] = shares.map((s) => ({
    ...s,
    member_name: nameOf.get(s.member_id) ?? s.member_id,
  }));
  const collected = views
    .filter((s) => s.paid)
    .reduce((a, s) => a + s.amount, 0);
  const paidCount = views.filter((s) => s.paid).length;
  return {
    settlement,
    shares: views,
    summary: {
      participants: views.length,
      paid_count: paidCount,
      unpaid_count: views.length - paidCount,
      collected,
      outstanding: settlement.total_amount - collected,
      total: settlement.total_amount,
    },
  };
}

export async function getSettlement(
  ctx: UseCaseContext,
  gameId: string,
): Promise<SettlementView | null> {
  const settlement = await ctx.repo.settlements.getByGame(gameId);
  if (!settlement) return null;
  return buildView(ctx, settlement);
}

export interface MarkPaidInput {
  gameId: string;
  memberId: string;
  paid: boolean;
}

export async function markPaid(
  ctx: UseCaseContext,
  input: MarkPaidInput,
): Promise<SettlementView> {
  const settlement = await ctx.repo.settlements.getByGame(input.gameId);
  if (!settlement) {
    throw new SettlementError(`この試合の精算がありません: ${input.gameId}`);
  }
  const share = await ctx.repo.settlements.getShare(
    settlement.id,
    input.memberId,
  );
  if (!share) {
    throw new SettlementError(
      `このメンバーは割り勘対象ではありません: ${input.memberId}`,
    );
  }
  const now = ctx.now().toISOString();
  await ctx.repo.settlements.updateSharePaid(
    share.id,
    input.paid,
    input.paid ? now : null,
    now,
  );

  // 全員払ったら settlement を SETTLED にし、COMPLETED の game も SETTLED へ進める。
  const shares = await ctx.repo.settlements.listShares(settlement.id);
  const allPaid = shares.every((s) =>
    s.id === share.id ? input.paid : s.paid,
  );
  const nextStatus = allPaid ? "SETTLED" : "OPEN";
  if (nextStatus !== settlement.status) {
    await ctx.repo.settlements.updateStatus(settlement.id, nextStatus, now);
    await writeAuditLog(ctx, {
      action: `SETTLEMENT_${nextStatus}`,
      targetType: "settlement",
      targetId: settlement.id,
      after: { ...settlement, status: nextStatus },
    });
    if (allPaid) {
      const game = await ctx.repo.games.get(settlement.game_id);
      if (game?.status === "COMPLETED") {
        await transitionGame(ctx, game.id, "SETTLED").catch(() => undefined);
      }
    }
  }

  const updated = await ctx.repo.settlements.getByGame(input.gameId);
  return buildView(ctx, updated ?? settlement);
}

// PayPay 割り勘の催促文を組み立てる (notify / autopilot が使う)。
export function formatSettlementMessage(
  gameTitle: string,
  view: SettlementView,
): string {
  const { settlement, summary, shares } = view;
  const perHead =
    summary.participants > 0
      ? Math.round(settlement.total_amount / summary.participants)
      : 0;
  const lines = [
    `💰 「${gameTitle}」の精算 (PayPay 割り勘)`,
    `合計 ¥${settlement.total_amount} / ${summary.participants}人 = 約 ¥${perHead}`,
  ];
  if (settlement.payment_link) {
    const label = settlement.payment_label ?? "PayPay";
    lines.push(`${label}: ${settlement.payment_link}`);
  }
  const unpaid = shares.filter((s) => !s.paid);
  if (unpaid.length > 0) {
    lines.push(
      `未払い ${unpaid.length}人: ${unpaid
        .map((s) => `${s.member_name} (¥${s.amount})`)
        .join(", ")}`,
    );
  } else {
    lines.push("全員精算済み 🎉");
  }
  return lines.join("\n");
}
