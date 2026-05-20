import type { GameStatus, RsvpSummary } from "./types";

const TRANSITIONS: Record<GameStatus, GameStatus[]> = {
  DRAFT: ["COLLECTING", "CONFIRMED", "CANCELLED"],
  COLLECTING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: [],
};

export function canTransition(from: GameStatus, to: GameStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAvailableTransitions(current: GameStatus): GameStatus[] {
  return TRANSITIONS[current] ?? [];
}

export interface GuardContext {
  rsvp: RsvpSummary;
  minPlayers: number;
  gameDate: string | null;
  now: Date;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function checkGuard(
  from: GameStatus,
  to: GameStatus,
  ctx: GuardContext,
): GuardResult {
  if (!canTransition(from, to)) {
    return { allowed: false, reason: `状態遷移が不正です: ${from} → ${to}` };
  }
  if (to === "CONFIRMED") {
    if (ctx.rsvp.available < ctx.minPlayers) {
      return {
        allowed: false,
        reason: `参加可 (${ctx.rsvp.available}) が最低人数 (${ctx.minPlayers}) に満たないため確定できません`,
      };
    }
  }
  if (from === "CONFIRMED" && to === "COMPLETED") {
    if (!ctx.gameDate) {
      return { allowed: false, reason: "試合日が設定されていません" };
    }
    const game = new Date(ctx.gameDate);
    const today = new Date(ctx.now);
    today.setHours(0, 0, 0, 0);
    if (game > today) {
      return { allowed: false, reason: "試合日がまだ到来していません" };
    }
  }
  return { allowed: true };
}
