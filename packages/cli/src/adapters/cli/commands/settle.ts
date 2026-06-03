import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { notifyTeam } from "../../../usecases/notification";
import {
  createSettlement,
  formatSettlementMessage,
  getSettlement,
  markPaid,
} from "../../../usecases/settlement";
import {
  type ParsedArgs,
  UsageError,
  boolFlag,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const openInput = z.object({
  gameId: z.string().min(1),
  totalAmount: z.coerce
    .number()
    .int()
    .positive("--amount は 1 以上の整数 (円)"),
  paymentLink: z.string().min(1).optional(),
  paymentLabel: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
  members: z.string().min(1).optional(), // CSV で参加者を明示
});

export async function runSettle(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound settle <open|show|pay|remind>");
  if (sub === "open") return openCmd(args, ctx, opts);
  if (sub === "show") return showCmd(args, ctx, opts);
  if (sub === "pay") return payCmd(args, ctx, opts);
  if (sub === "remind") return remindCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: settle ${sub}`);
}

function viewText(
  title: string,
  view: NonNullable<Awaited<ReturnType<typeof getSettlement>>>,
): string {
  const s = view.summary;
  return [
    `${title} — 合計 ¥${s.total} / ${s.participants}人 / 回収 ¥${s.collected} / 未回収 ¥${s.outstanding} (未払い ${s.unpaid_count}人)`,
    formatRows(view.shares, ["member_name", "amount", "paid", "paid_at"]),
  ].join("\n");
}

async function openCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(openInput, {
    gameId: requireFlag(args.flags, "game"),
    totalAmount: requireFlag(args.flags, "amount"),
    paymentLink: optionalFlag(args.flags, "link"),
    paymentLabel: optionalFlag(args.flags, "label"),
    note: optionalFlag(args.flags, "note"),
    members: optionalFlag(args.flags, "members"),
  });
  await createSettlement(ctx, {
    gameId: data.gameId,
    totalAmount: data.totalAmount,
    paymentLink: data.paymentLink ?? null,
    paymentLabel: data.paymentLabel ?? null,
    note: data.note ?? null,
    participantMemberIds: data.members
      ? data.members
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
  });
  const view = await getSettlement(ctx, data.gameId);
  if (!view) throw new UsageError("精算の作成に失敗しました");
  emit(view, viewText("精算を作成しました", view), opts);
}

async function showCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const view = await getSettlement(ctx, gameId);
  if (!view) {
    emit({ found: false, game_id: gameId }, `精算なし: ${gameId}`, opts);
    return;
  }
  emit(view, viewText("精算", view), opts);
}

async function payCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const memberId = requireFlag(args.flags, "member");
  const paid = !boolFlag(args.flags, "unpaid");
  const view = await markPaid(ctx, { gameId, memberId, paid });
  emit(
    view,
    viewText(paid ? "支払いを記録しました" : "未払いに戻しました", view),
    opts,
  );
}

async function remindCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const view = await getSettlement(ctx, gameId);
  if (!view) throw new UsageError(`この試合の精算がありません: ${gameId}`);
  const game = await ctx.repo.games.get(gameId);
  const message = formatSettlementMessage(game?.title ?? "試合", view);
  const deliveries = await notifyTeam(ctx, view.settlement.team_id, message);
  emit({ message, deliveries }, `催促を送信しました\n${message}`, opts);
}
