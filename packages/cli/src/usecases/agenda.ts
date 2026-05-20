import type { Game, RsvpSummary } from "../domain/types";
import type { UseCaseContext } from "../ports";

export interface AgendaCollecting {
  game: Game;
  rsvp: RsvpSummary;
  ready_to_confirm: boolean;
  shortage: number;
}

export interface AgendaUpcoming {
  game: Game;
  days_until: number;
}

export interface Agenda {
  generated_at: string;
  team_id: string | null;
  horizon_days: number;
  needs_publish: Game[];
  collecting: AgendaCollecting[];
  upcoming: AgendaUpcoming[];
  needs_completion: Game[];
  needs_settlement: Game[];
}

export interface AgendaInput {
  teamId?: string;
  horizonDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function computeAgenda(
  ctx: UseCaseContext,
  input: AgendaInput,
): Promise<Agenda> {
  const { teamId, horizonDays } = input;
  const now = ctx.now();
  const today = startOfDay(now);

  const [drafts, collectingGames, confirmedGames, completedGames] =
    await Promise.all([
      ctx.repo.games.list({ teamId, status: "DRAFT" }),
      ctx.repo.games.list({ teamId, status: "COLLECTING" }),
      ctx.repo.games.list({ teamId, status: "CONFIRMED" }),
      ctx.repo.games.list({ teamId, status: "COMPLETED" }),
    ]);

  const collecting = await Promise.all(
    collectingGames.map(async (game): Promise<AgendaCollecting> => {
      const rsvp = await ctx.repo.rsvps.summarize(game.id, game.team_id);
      const shortage = Math.max(0, game.min_players - rsvp.available);
      return { game, rsvp, ready_to_confirm: shortage === 0, shortage };
    }),
  );

  const upcoming: AgendaUpcoming[] = [];
  const needsCompletion: Game[] = [];
  for (const game of confirmedGames) {
    if (!game.game_date) continue;
    const date = startOfDay(new Date(game.game_date));
    const diff = Math.round((date.getTime() - today.getTime()) / DAY_MS);
    if (diff < 0) {
      needsCompletion.push(game);
    } else if (diff <= horizonDays) {
      upcoming.push({ game, days_until: diff });
    }
  }
  upcoming.sort((a, b) => a.days_until - b.days_until);

  return {
    generated_at: now.toISOString(),
    team_id: teamId ?? null,
    horizon_days: horizonDays,
    needs_publish: drafts,
    collecting,
    upcoming,
    needs_completion: needsCompletion,
    needs_settlement: completedGames,
  };
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
