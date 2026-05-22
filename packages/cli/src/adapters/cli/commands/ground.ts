import { readFileSync } from "node:fs";
import type { UseCaseContext } from "../../../ports";
import {
  importGroundAvailability,
  listGroundSlots,
} from "../../../usecases/ground";
import { type ParsedArgs, UsageError, boolFlag, optionalFlag } from "../args";
import { type RenderOptions, emit, formatRows } from "../output";

export async function runGround(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound ground <import|list>");
  if (sub === "import") return importCommand(args, ctx, opts);
  if (sub === "list") return listCommand(args, ctx, opts);
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
