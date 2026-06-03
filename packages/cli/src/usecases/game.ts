import { checkGuard, getAvailableTransitions } from "../domain/state-machine";
import type {
  Game,
  GameStatus,
  GroundSlot,
  RsvpBreakdown,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import {
  GameNotFoundError,
  TeamNotFoundError,
  TransitionDeniedError,
} from "./errors";
import { findSlotsMatchingGame } from "./ground";
import { notifyGameTransition } from "./notification";

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

export interface UpdateGameInput {
  gameId: string;
  // undefined = 変更しない。既存 game の note 後更新もこれで可能 (AGENTS.md §9 解消)。
  title?: string;
  date?: string | null;
  ground?: string | null;
  minPlayers?: number;
  note?: string | null;
}

export async function updateGame(
  ctx: UseCaseContext,
  input: UpdateGameInput,
): Promise<Game> {
  const game = await ctx.repo.games.get(input.gameId);
  if (!game) throw new GameNotFoundError(input.gameId);
  const before = { ...game };
  const updated: Game = {
    ...game,
    title: input.title ?? game.title,
    game_date: input.date === undefined ? game.game_date : input.date,
    ground_name: input.ground === undefined ? game.ground_name : input.ground,
    min_players: input.minPlayers ?? game.min_players,
    note: input.note === undefined ? game.note : input.note,
    updated_at: ctx.now().toISOString(),
  };
  await ctx.repo.games.update(updated);
  await writeAuditLog(ctx, {
    action: "GAME_UPDATED",
    targetType: "game",
    targetId: game.id,
    before,
    after: updated,
  });
  return updated;
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
  available_transitions: GameStatus[];
  // game.game_date と game.ground_name に一致する取り込み済み ground_slots。
  // どちらかが null なら空配列。詳細は usecases/ground.ts:findSlotsMatchingGame
  matching_ground_slots: GroundSlot[];
}

export async function showGame(
  ctx: UseCaseContext,
  id: string,
): Promise<GameDetail> {
  const game = await ctx.repo.games.get(id);
  if (!game) throw new GameNotFoundError(id);
  const breakdown = await ctx.repo.rsvps.breakdown(game.id, game.team_id);
  const matching = await findSlotsMatchingGame(ctx, game);
  return {
    game,
    rsvp_summary: {
      available: breakdown.available.length,
      unavailable: breakdown.unavailable.length,
      maybe: breakdown.maybe.length,
      no_response: breakdown.no_response.length,
    },
    rsvp_breakdown: breakdown,
    available_transitions: getAvailableTransitions(game.status),
    matching_ground_slots: matching,
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
    throw new TransitionDeniedError({
      from: game.status,
      to,
      available_transitions: getAvailableTransitions(game.status),
      reason: guard.reason ?? "遷移が許可されていません",
      rsvp_summary: rsvp,
      min_players: game.min_players,
    });
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
  // 通知は fire-and-forget で送る。失敗してもドメイン遷移は成功扱い。
  // sender 内部で try/catch しているので例外は来ない想定だが念のため握り潰す。
  await notifyGameTransition(ctx, after, game.status, to).catch(() => []);
  return after;
}
