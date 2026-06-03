// autopilot: 現在状態 (agenda) + チームの決め事 (Gold) から「いま打つべき手」を
// 算出し、安全な手は自動実行・チームを拘束する手は提案に留める。
//
// 原則「AI は提案する。人が最後に決める」に従い:
//   - SAFE          … --apply で自動実行 (公開 / 完了マーク / リマインド送信)
//   - NEEDS_APPROVAL … 常に提案のみ (確定 / 中止 など、チームを拘束する手)
import type { GameStatus } from "../domain/types";
import type { NotificationDeliveryResult, UseCaseContext } from "../ports";
import { computeAgenda } from "./agenda";
import { TeamNotFoundError } from "./errors";
import { transitionGame } from "./game";
import { notifyTeam } from "./notification";
import { formatSettlementMessage, getSettlement } from "./settlement";

export type AutoActionKind =
  | "PUBLISH" // DRAFT → COLLECTING (出欠回収を開始)
  | "CONFIRM" // COLLECTING → CONFIRMED (人数充足、要承認)
  | "COMPLETE" // CONFIRMED → COMPLETED (試合日が経過)
  | "REMIND_COLLECTING" // 出欠が足りない試合のリマインド
  | "REMIND_SETTLEMENT"; // 精算待ちのリマインド

export type AutoRisk = "SAFE" | "NEEDS_APPROVAL";

export interface AutoAction {
  kind: AutoActionKind;
  risk: AutoRisk;
  game_id: string;
  game_title: string;
  reason: string;
  transition_to: GameStatus | null; // 遷移系アクションのみ
  message: string | null; // リマインド系アクションのみ
}

export interface AutoPlan {
  team_id: string;
  generated_at: string;
  horizon_days: number;
  actions: AutoAction[];
}

export interface ExecutedAction {
  action: AutoAction;
  ok: boolean;
  error: string | null;
  deliveries?: NotificationDeliveryResult[];
}

export interface AutoRunResult extends AutoPlan {
  applied: boolean;
  executed: ExecutedAction[];
  proposed: AutoAction[]; // 自動実行しなかった (NEEDS_APPROVAL / dry-run) 手
}

export interface AutoInput {
  teamId: string;
  horizonDays: number;
}

export async function planAutopilot(
  ctx: UseCaseContext,
  input: AutoInput,
): Promise<AutoPlan> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const agenda = await computeAgenda(ctx, {
    teamId: team.id,
    horizonDays: input.horizonDays,
  });
  const actions: AutoAction[] = [];

  for (const game of agenda.needs_publish) {
    actions.push({
      kind: "PUBLISH",
      risk: "SAFE",
      game_id: game.id,
      game_title: game.title,
      reason: "DRAFT のまま。公開して出欠回収を始める",
      transition_to: "COLLECTING",
      message: null,
    });
  }

  for (const c of agenda.collecting) {
    if (c.ready_to_confirm) {
      actions.push({
        kind: "CONFIRM",
        risk: "NEEDS_APPROVAL",
        game_id: c.game.id,
        game_title: c.game.title,
        reason: `参加可 ${c.rsvp.available} 人で最低人数を満たした。確定の最終判断は人間`,
        transition_to: "CONFIRMED",
        message: null,
      });
    } else {
      actions.push({
        kind: "REMIND_COLLECTING",
        risk: "SAFE",
        game_id: c.game.id,
        game_title: c.game.title,
        reason: `あと ${c.shortage} 人足りない`,
        transition_to: null,
        message: `⚾ 「${c.game.title}」の出欠回収中です。あと ${c.shortage} 人で成立します。出られる方は回答をお願いします！`,
      });
    }
  }

  for (const game of agenda.needs_completion) {
    actions.push({
      kind: "COMPLETE",
      risk: "SAFE",
      game_id: game.id,
      game_title: game.title,
      reason: "試合日が過ぎた。完了として記録する",
      transition_to: "COMPLETED",
      message: null,
    });
  }

  for (const game of agenda.needs_settlement) {
    // 精算が作成済みなら PayPay リンク + 未払い者入りの催促を、未作成なら作成を促す。
    const view = await getSettlement(ctx, game.id);
    const message = view
      ? formatSettlementMessage(game.title, view)
      : `💰 「${game.title}」の精算がまだです。mound settle open で PayPay 割り勘を作成してください。`;
    actions.push({
      kind: "REMIND_SETTLEMENT",
      risk: "SAFE",
      game_id: game.id,
      game_title: game.title,
      reason: view
        ? `未払い ${view.summary.unpaid_count}人 / 未回収 ¥${view.summary.outstanding}`
        : "完了済だが精算が未作成",
      transition_to: null,
      message,
    });
  }

  return {
    team_id: team.id,
    generated_at: ctx.now().toISOString(),
    horizon_days: input.horizonDays,
    actions,
  };
}

export interface AutoRunInput extends AutoInput {
  apply: boolean;
}

export async function runAutopilot(
  ctx: UseCaseContext,
  input: AutoRunInput,
): Promise<AutoRunResult> {
  const plan = await planAutopilot(ctx, input);
  const executed: ExecutedAction[] = [];
  const proposed: AutoAction[] = [];

  for (const action of plan.actions) {
    // SAFE な手だけ、--apply のときに自動実行する。
    if (!input.apply || action.risk !== "SAFE") {
      proposed.push(action);
      continue;
    }
    try {
      if (action.transition_to) {
        await transitionGame(ctx, action.game_id, action.transition_to);
        executed.push({ action, ok: true, error: null });
      } else if (action.message) {
        const deliveries = await notifyTeam(ctx, plan.team_id, action.message);
        executed.push({ action, ok: true, error: null, deliveries });
      } else {
        executed.push({ action, ok: true, error: null });
      }
    } catch (e) {
      executed.push({
        action,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ...plan, applied: input.apply, executed, proposed };
}
