import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { GameNotFoundError } from "../../../usecases/errors";
import {
  detectNewSlots,
  findSlotsMatchingGame,
  importGroundAvailability,
  listGroundSlots,
  pruneGroundSlots,
} from "../../../usecases/ground";
import { notifyGroundCancellation } from "../../../usecases/notification";
import {
  type ParsedArgs,
  UsageError,
  boolFlag,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

export async function runGround(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub)
    throw new UsageError("使い方: mound ground <import|list|diff|sync|match>");
  if (sub === "import") return importCommand(args, ctx, opts);
  if (sub === "list") return listCommand(args, ctx, opts);
  if (sub === "diff") return diffCommand(args, ctx, opts);
  if (sub === "sync") return syncCommand(args, ctx, opts);
  if (sub === "match") return matchCommand(args, ctx, opts);
  if (sub === "prune") return pruneCommand(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: ground ${sub}`);
}

async function matchCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const game = await ctx.repo.games.get(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  const slots = await findSlotsMatchingGame(ctx, game);
  const out = { game, count: slots.length, matching_slots: slots };
  const text =
    slots.length === 0
      ? `${game.title} (${game.game_date ?? "日付未定"} / ${game.ground_name ?? "会場未定"}) に整合する slot はありません`
      : [
          `${game.title} (${game.game_date} / ${game.ground_name}) に整合する slot: ${slots.length} 件`,
          formatRows(slots, [
            "source",
            "facility_name",
            "time_range",
            "status",
            "first_seen_at",
          ]),
        ].join("\n");
  emit(out, text, opts);
}

async function readPayload(args: ParsedArgs): Promise<unknown> {
  const file = optionalFlag(args.flags, "file");
  const useStdin = boolFlag(args.flags, "stdin");

  if (file && useStdin) {
    throw new UsageError("--file と --stdin は同時指定できません");
  }
  if (!file && !useStdin) {
    throw new UsageError(
      "--file <PATH> か --stdin のいずれかを指定してください",
    );
  }

  const raw = file ? readFileSync(file, "utf-8") : await readStdin();
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new UsageError(`JSON のパースに失敗しました: ${msg}`);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) =>
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk),
    );
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf-8")),
    );
    process.stdin.on("error", reject);
  });
}

async function importCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const payload = await readPayload(args);
  const result = await importGroundAvailability(ctx, payload);
  const text = [
    `取り込みました: ${result.total_records} 件 (新規 ${result.inserted} / 更新 ${result.updated})`,
    `scraped_at: ${result.scraped_at}`,
    result.regions_with_errors.length > 0
      ? `エラー有り region: ${result.regions_with_errors.map((r) => r.region).join(", ")}`
      : "エラー無し",
  ].join("\n");
  emit(result, text, opts);
}

const maxAgeHoursInput = z.coerce
  .number()
  .int()
  .min(0)
  .max(24 * 365);

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function listCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const showAll = boolFlag(args.flags, "all");
  const explicitDate = optionalFlag(args.flags, "date");

  // 既定は「実行時点以降 (= 今日以降) の空き」だけ。取得タイミングではフィルタしない。
  // --all で過去も含む全件、--date で特定日、--since-date で起点変更。
  const sinceDate =
    showAll || explicitDate
      ? undefined
      : (optionalFlag(args.flags, "since-date") ?? todayIso(ctx.now()));

  const slots = await listGroundSlots(ctx, {
    source: optionalFlag(args.flags, "source"),
    dateIso: explicitDate,
    sinceDate,
  });
  const header = showAll
    ? `${slots.length} 件 (全件)`
    : `${slots.length} 件 (${sinceDate ?? "指定日"} 以降の空き。過去も見るなら --all)`;
  emit(
    slots,
    [
      header,
      formatRows(slots, [
        "source",
        "facility_name",
        "date_iso",
        "time_range",
        "status",
        "ingested_at",
      ]),
    ].join("\n"),
    opts,
  );
}

async function pruneCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const now = ctx.now();
  // 既定: 過去日 + テストデータを削除。--max-age-hours で古い取得も対象に。
  const beforeDate = optionalFlag(args.flags, "before-date") ?? todayIso(now);
  const maxAgeFlag = optionalFlag(args.flags, "max-age-hours");
  const ingestedBefore = maxAgeFlag
    ? new Date(
        now.getTime() - parseOrUsage(maxAgeHoursInput, maxAgeFlag) * 3_600_000,
      ).toISOString()
    : undefined;
  const deleted = await pruneGroundSlots(ctx, { beforeDate, ingestedBefore });
  emit(
    {
      deleted,
      before_date: beforeDate,
      ingested_before: ingestedBefore ?? null,
    },
    `古い/過去/テストの空き枠を ${deleted} 件削除しました (${beforeDate} より前の日付・テストデータ${ingestedBefore ? ` + ${maxAgeFlag}h より前の取得` : ""})`,
    opts,
  );
}

const minutesInput = z.coerce
  .number()
  .int()
  .min(1)
  .max(60 * 24 * 30);

// --since と --minutes を排他に処理し、since の ISO8601 を返す。
function resolveSince(args: ParsedArgs, now: Date): string {
  const sinceFlag = optionalFlag(args.flags, "since");
  const minutesFlag = optionalFlag(args.flags, "minutes");
  if (sinceFlag && minutesFlag) {
    throw new UsageError("--since と --minutes は同時指定できません");
  }
  if (sinceFlag) {
    const parsed = new Date(sinceFlag);
    if (Number.isNaN(parsed.getTime())) {
      throw new UsageError(
        "--since は ISO8601 形式 (例: 2026-05-22T09:00:00Z) を指定してください",
      );
    }
    return parsed.toISOString();
  }
  const minutes = minutesFlag ? parseOrUsage(minutesInput, minutesFlag) : 60;
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

const timeoutInput = z.coerce
  .number()
  .int()
  .min(1)
  .max(10 * 60 * 1000);

async function syncCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const region = optionalFlag(args.flags, "region") ?? "all";
  const bin = optionalFlag(args.flags, "bin") ?? "ground-monitoring";
  const timeoutFlag = optionalFlag(args.flags, "timeout-ms");
  const timeout = timeoutFlag
    ? parseOrUsage(timeoutInput, timeoutFlag)
    : 60_000;
  const shouldNotify = boolFlag(args.flags, "notify");
  const teamId = optionalFlag(args.flags, "team");
  if (shouldNotify && !teamId) {
    throw new UsageError("--notify を指定したら --team も必要です");
  }

  // この sync で初めて見る slot は first_seen_at >= beforeSyncAt になるはず。
  const beforeSyncAt = ctx.now().toISOString();

  // ground-monitoring を spawn して JSON を取る。
  const result = spawnSync(bin, ["--region", region, "--json"], {
    encoding: "utf-8",
    timeout,
  });
  if (result.error) {
    // ENOENT (バイナリ未インストール) もここで包まれる。
    throw new Error(`scraper 起動に失敗: ${result.error.message}`);
  }
  if (result.signal === "SIGTERM") {
    throw new Error(`scraper がタイムアウトしました (${timeout}ms)`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(
      `scraper が exit ${result.status} で終了しました${stderr ? `: ${stderr}` : ""}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`scraper の stdout が JSON ではありません: ${msg}`);
  }

  const importResult = await importGroundAvailability(ctx, payload);

  // --notify --team が指定されていれば、この sync で初観測の slot だけ抽出して送る。
  const newSlots = await detectNewSlots(ctx, { since: beforeSyncAt });
  let notifications: unknown[] = [];
  if (shouldNotify && teamId) {
    notifications = await notifyGroundCancellation(ctx, teamId, newSlots);
  }

  const out = {
    region,
    bin,
    ...importResult,
    new_slots: newSlots,
    ...(shouldNotify ? { notifications } : {}),
  };
  const text = [
    `sync (${bin} --region ${region}) 完了`,
    `取り込み: ${importResult.total_records} 件 (新規 ${importResult.inserted} / 更新 ${importResult.updated})`,
    `新規観測 slot: ${newSlots.length} 件`,
    shouldNotify ? `通知送信: ${notifications.length} 件` : "",
  ]
    .filter(Boolean)
    .join("\n");
  emit(out, text, opts);
}

async function diffCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const since = resolveSince(args, ctx.now());
  const slots = await detectNewSlots(ctx, {
    since,
    source: optionalFlag(args.flags, "source"),
    dateIso: optionalFlag(args.flags, "game-date"),
  });

  // --notify --team T が同時にあれば、検出結果をそのチームの enabled channel に push。
  let notifications: unknown[] = [];
  const shouldNotify = boolFlag(args.flags, "notify");
  if (shouldNotify) {
    const teamId = optionalFlag(args.flags, "team");
    if (!teamId) {
      throw new UsageError("--notify を指定したら --team も必要です");
    }
    notifications = await notifyGroundCancellation(ctx, teamId, slots);
  }

  const result = {
    since,
    count: slots.length,
    slots,
    ...(shouldNotify ? { notifications } : {}),
  };
  const text =
    slots.length === 0
      ? `since ${since} 以降の新規空きはありません`
      : [
          `since ${since} 以降に検出された空き: ${slots.length} 件`,
          formatRows(slots, [
            "source",
            "facility_name",
            "date_iso",
            "time_range",
            "status",
            "first_seen_at",
          ]),
          shouldNotify ? `通知送信: ${notifications.length} 件` : "",
        ]
          .filter(Boolean)
          .join("\n");
  emit(result, text, opts);
}
