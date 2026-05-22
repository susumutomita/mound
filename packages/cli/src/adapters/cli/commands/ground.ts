import { readFileSync } from "node:fs";
import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import {
  detectNewSlots,
  importGroundAvailability,
  listGroundSlots,
} from "../../../usecases/ground";
import { notifyGroundCancellation } from "../../../usecases/notification";
import { type ParsedArgs, UsageError, boolFlag, optionalFlag } from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

export async function runGround(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound ground <import|list|diff>");
  if (sub === "import") return importCommand(args, ctx, opts);
  if (sub === "list") return listCommand(args, ctx, opts);
  if (sub === "diff") return diffCommand(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: ground ${sub}`);
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

async function listCommand(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const slots = await listGroundSlots(ctx, {
    source: optionalFlag(args.flags, "source"),
    dateIso: optionalFlag(args.flags, "date"),
  });
  emit(
    slots,
    formatRows(slots, [
      "source",
      "facility_name",
      "date_iso",
      "time_range",
      "status",
      "first_seen_at",
    ]),
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
