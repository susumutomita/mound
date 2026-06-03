import { checkGuard, getAvailableTransitions } from "../domain/state-machine";
import {
  type Game,
  type GameStatus,
  type GroundSlot,
  type GroundStatus,
  type RsvpBreakdown,
  WEEKDAY_CODES,
  type WeekdayCode,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import {
  GameNotFoundError,
  InvalidInputError,
  TeamNotFoundError,
  TransitionDeniedError,
} from "./errors";
import { findSlotsMatchingGame } from "./ground";
import { getTeamPreferences } from "./knowledge";
import { notifyGameTransition } from "./notification";

export interface CreateGameInput {
  teamId: string;
  title: string;
  date: string | null;
  ground: string | null;
  groundStatus: GroundStatus | null;
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
    ground_status: input.groundStatus,
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
  groundStatus?: GroundStatus | null;
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
    ground_status:
      input.groundStatus === undefined
        ? game.ground_status
        : input.groundStatus,
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

export interface GenerateMonthlyGamesInput {
  teamId: string;
  month: string; // "YYYY-MM"
  weekday?: WeekdayCode; // 未指定なら knowledge の default_weekday
  ground?: string | null; // 未指定なら default_ground
  minPlayers?: number; // 未指定なら default_min_players か 9
  title?: string;
}

// 月次ルーティン用: 指定月の該当曜日ぶんの候補試合を DRAFT(ground_status=WANTED)で
// 一括生成する。チームの決め事(default_weekday/ground/min_players)を既定値に使う。
// 既に試合がある日付はスキップするので再実行しても重複しない。
export async function generateMonthlyGames(
  ctx: UseCaseContext,
  input: GenerateMonthlyGamesInput,
): Promise<Game[]> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);

  const prefs = new Map(
    (await getTeamPreferences(ctx, team.id)).map((p) => [p.key, p.value]),
  );
  const weekday =
    input.weekday ?? (prefs.get("default_weekday") as WeekdayCode | undefined);
  if (!weekday || !(WEEKDAY_CODES as readonly string[]).includes(weekday)) {
    throw new InvalidInputError(
      "活動曜日が不明です (--weekday を指定するか knowledge set default_weekday)",
    );
  }
  const m = /^(\d{4})-(\d{2})$/.exec(input.month);
  if (!m)
    throw new InvalidInputError("--month は YYYY-MM 形式で指定してください");
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) {
    throw new InvalidInputError("--month の月は 01-12 です");
  }

  const ground = input.ground ?? prefs.get("default_ground") ?? null;
  const minPlayers =
    input.minPlayers ?? (Number(prefs.get("default_min_players")) || 9);
  const title = input.title ?? "練習試合";

  const weekdayIdx = (WEEKDAY_CODES as readonly string[]).indexOf(weekday);
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month0, d));
    if (dt.getUTCDay() === weekdayIdx)
      dates.push(dt.toISOString().slice(0, 10));
  }

  // 既に試合がある日付はスキップ (再実行で重複しない)。
  const existing = await ctx.repo.games.list({ teamId: team.id });
  const existingDates = new Set(
    existing.map((g) => g.game_date).filter((d): d is string => d !== null),
  );

  const created: Game[] = [];
  for (const date of dates) {
    if (existingDates.has(date)) continue;
    created.push(
      await createGame(ctx, {
        teamId: team.id,
        title,
        date,
        ground,
        groundStatus: "WANTED",
        minPlayers,
        note: null,
      }),
    );
  }
  return created;
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
