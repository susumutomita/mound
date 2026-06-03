// ビューアー(HTML ダッシュボード)用のデータ集計。
// 「トモがスマホで今の状況をパッと見る」ためのスナップショット。既存 usecase を再利用。
import type {
  Game,
  GroundSlot,
  RsvpBreakdown,
  Team,
  TeamKnowledge,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { type Agenda, computeAgenda } from "./agenda";
import { TeamNotFoundError } from "./errors";
import { listGroundSlots } from "./ground";
import { listKnowledge } from "./knowledge";
import { type SettlementView, getSettlement } from "./settlement";

export interface DashboardGame {
  game: Game;
  rsvp: RsvpBreakdown;
  available: number;
  unavailable: number;
  maybe: number;
  no_response: number;
  shortage: number; // 成立まであと何人 (min_players - available, 0 以上)
  settlement: SettlementView | null;
}

export interface Dashboard {
  team: Team;
  generated_at: string;
  horizon_days: number;
  agenda: Agenda;
  games: DashboardGame[]; // 進行中の試合 (CANCELLED/SETTLED 以外) を日付順
  ground_slots: GroundSlot[]; // 実行時点以降の空き
  knowledge: TeamKnowledge[];
}

export interface BuildDashboardInput {
  teamId: string;
  horizonDays: number;
}

export async function buildDashboard(
  ctx: UseCaseContext,
  input: BuildDashboardInput,
): Promise<Dashboard> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);

  const agenda = await computeAgenda(ctx, {
    teamId: team.id,
    horizonDays: input.horizonDays,
  });

  const all = await ctx.repo.games.list({ teamId: team.id });
  const active = all.filter(
    (g) => g.status !== "CANCELLED" && g.status !== "SETTLED",
  );
  active.sort((a, b) =>
    (a.game_date ?? "9999").localeCompare(b.game_date ?? "9999"),
  );

  const games: DashboardGame[] = [];
  for (const game of active) {
    const rsvp = await ctx.repo.rsvps.breakdown(game.id, game.team_id);
    const available = rsvp.available.length;
    const settlement =
      game.status === "COMPLETED" ? await getSettlement(ctx, game.id) : null;
    games.push({
      game,
      rsvp,
      available,
      unavailable: rsvp.unavailable.length,
      maybe: rsvp.maybe.length,
      no_response: rsvp.no_response.length,
      shortage: Math.max(0, game.min_players - available),
      settlement,
    });
  }

  const today = ctx.now().toISOString().slice(0, 10);
  const [groundSlots, knowledge] = await Promise.all([
    listGroundSlots(ctx, { sinceDate: today }),
    listKnowledge(ctx, { teamId: team.id }),
  ]);

  return {
    team,
    generated_at: ctx.now().toISOString(),
    horizon_days: input.horizonDays,
    agenda,
    games,
    ground_slots: groundSlots,
    knowledge,
  };
}
