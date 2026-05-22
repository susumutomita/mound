import { z } from "zod";
import { assertGameStatus } from "../../../domain/guards";
import { GAME_STATUSES, type GameStatus } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  createGame,
  listGames,
  showGame,
  transitionGame,
} from "../../../usecases/game";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const createInput = z.object({
  teamId: z.string().min(1),
  title: z.string().min(1).max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date は YYYY-MM-DD 形式")
    .optional(),
  ground: z.string().max(80).optional(),
  minPlayers: z.coerce.number().int().min(1).max(30).default(9),
  note: z.string().max(500).optional(),
});

const statusFilterInput = z
  .enum(GAME_STATUSES)
  .optional()
  .or(z.literal("").transform(() => undefined));

export async function runGame(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub)
    throw new UsageError("使い方: mound game <create|list|show|transition>");
  if (sub === "create") return create(args, ctx, opts);
  if (sub === "list") return list(args, ctx, opts);
  if (sub === "show") return show(args, ctx, opts);
  if (sub === "transition") return transition(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: game ${sub}`);
}

async function create(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(createInput, {
    teamId: requireFlag(args.flags, "team"),
    title: requireFlag(args.flags, "title"),
    date: optionalFlag(args.flags, "date"),
    ground: optionalFlag(args.flags, "ground"),
    minPlayers: optionalFlag(args.flags, "min-players"),
    note: optionalFlag(args.flags, "note"),
  });
  const game = await createGame(ctx, {
    teamId: data.teamId,
    title: data.title,
    date: data.date ?? null,
    ground: data.ground ?? null,
    minPlayers: data.minPlayers,
    note: data.note ?? null,
  });
  emit(game, `試合を作成しました: ${game.id} (${game.title}) [DRAFT]`, opts);
}

async function list(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const statusFlag = optionalFlag(args.flags, "status");
  const status = parseOrUsage(statusFilterInput, statusFlag);
  const games = await listGames(ctx, {
    teamId: optionalFlag(args.flags, "team"),
    status,
  });
  emit(
    games,
    formatRows(games, ["id", "title", "status", "game_date", "ground_name"]),
    opts,
  );
}

async function show(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new UsageError("使い方: mound game show <id>");
  const detail = await showGame(ctx, id);
  const { game, rsvp_summary: s, rsvp_breakdown: b } = detail;
  const names = (rows: { member_name: string }[]) =>
    rows.length === 0 ? "(なし)" : rows.map((r) => r.member_name).join(", ");
  const transitions =
    detail.available_transitions.length === 0
      ? "(終端)"
      : detail.available_transitions.join(" | ");
  const matchingText =
    detail.matching_ground_slots.length === 0
      ? "整合する空き枠: (なし — 取り込み済み slot に同日同会場のものなし)"
      : [
          `整合する空き枠: ${detail.matching_ground_slots.length} 件`,
          ...detail.matching_ground_slots.map(
            (slot) =>
              `  - ${slot.source} ${slot.facility_name} ${slot.time_range ?? ""} ${slot.status ?? ""}`,
          ),
        ].join("\n");
  const text = [
    `${game.title} [${game.status}]`,
    `id: ${game.id}`,
    `team: ${game.team_id}`,
    `date: ${game.game_date ?? "(未定)"}`,
    `ground: ${game.ground_name ?? "(未定)"}`,
    `min_players: ${game.min_players}`,
    `note: ${game.note ?? ""}`,
    `RSVP: available=${s.available} unavailable=${s.unavailable} maybe=${s.maybe} no_response=${s.no_response}`,
    `  参加可:   ${names(b.available)}`,
    `  欠席:     ${names(b.unavailable)}`,
    `  未定:     ${names(b.maybe)}`,
    `  未回答:   ${names(b.no_response)}`,
    `次の遷移: ${transitions}`,
    matchingText,
  ].join("\n");
  emit(detail, text, opts);
}

function toGameStatusOrUsage(input: string): GameStatus {
  try {
    return assertGameStatus(input);
  } catch {
    throw new UsageError(`未知のステータス: ${input}`);
  }
}

async function transition(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id)
    throw new UsageError("使い方: mound game transition <id> --to <STATUS>");
  const to = toGameStatusOrUsage(requireFlag(args.flags, "to"));
  const after = await transitionGame(ctx, id, to);
  emit(after, `状態を遷移しました: → ${to}`, opts);
}
