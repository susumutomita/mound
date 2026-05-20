import { checkGuard } from "../domain/state-machine";
import type { Game, GameStatus, RsvpBreakdown } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import {
  GameNotFoundError,
  TeamNotFoundError,
  TransitionDeniedError,
} from "./errors";

export interface CreateGameInput {
  teamId: string;
  title: string;
  date: string | null;
  ground: string | null;
  minPlayers: number;
  note: string | null;
}

export async function createGame(
  ctx: UseCaseContext,
  input: CreateGameInput,
): Promise<Game> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const now = ctx.now().toISOString();
  const game: Game = {
    id: ctx.newId(),
    team_id: team.id,
    title: input.title,
    status: "DRAFT",
    game_date: input.date,
    ground_name: input.ground,
    min_players: input.minPlayers,
    note: input.note,
    created_at: now,
    updated_at: now,
  };
  await ctx.repo.games.insert(game);
  await writeAuditLog(ctx, {
    action: "GAME_CREATED",
    targetType: "game",
    targetId: game.id,
    after: game,
  });
  return game;
}

export interface ListGamesInput {
  teamId?: string;
  status?: GameStatus;
}

export async function listGames(
  ctx: UseCaseContext,
  input: ListGamesInput,
): Promise<Game[]> {
  return ctx.repo.games.list(input);
}

export interface GameDetail {
  game: Game;
  rsvp_summary: {
    available: number;
    unavailable: number;
    maybe: number;
    no_response: number;
  };
  rsvp_breakdown: RsvpBreakdown;
}

export async function showGame(
  ctx: UseCaseContext,
  id: string,
): Promise<GameDetail> {
  const game = await ctx.repo.games.get(id);
  if (!game) throw new GameNotFoundError(id);
  const breakdown = await ctx.repo.rsvps.breakdown(game.id, game.team_id);
  return {
    game,
    rsvp_summary: {
      available: breakdown.available.length,
      unavailable: breakdown.unavailable.length,
      maybe: breakdown.maybe.length,
      no_response: breakdown.no_response.length,
    },
    rsvp_breakdown: breakdown,
  };
}

export async function transitionGame(
  ctx: UseCaseContext,
  id: string,
  to: GameStatus,
): Promise<Game> {
  const game = await ctx.repo.games.get(id);
  if (!game) throw new GameNotFoundError(id);
  const rsvp = await ctx.repo.rsvps.summarize(game.id, game.team_id);
  const guard = checkGuard(game.status, to, {
    rsvp,
    minPlayers: game.min_players,
    gameDate: game.game_date,
    now: ctx.now(),
  });
  if (!guard.allowed) {
    throw new TransitionDeniedError(guard.reason ?? "遷移が許可されていません");
  }
  const nowIso = ctx.now().toISOString();
  const before = { ...game };
  await ctx.repo.games.updateStatus(game.id, to, nowIso);
  const after = { ...game, status: to, updated_at: nowIso };
  await writeAuditLog(ctx, {
    action: `GAME_TRANSITION:${game.status}->${to}`,
    targetType: "game",
    targetId: game.id,
    before,
    after,
  });
  return after;
}
