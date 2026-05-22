import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { listGroundSlots } from "../../../usecases/ground";
import {
  addGroundWatch,
  filterSlotsByTeamWatches,
  listGroundWatches,
  removeGroundWatch,
} from "../../../usecases/ground-watch";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_VALUES = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

const addInput = z.object({
  teamId: z.string().min(1),
  label: z.string().max(80).optional(),
  source: z.string().min(1).max(40).optional(),
  facilityPattern: z.string().max(200).optional(),
  weekdays: z
    .string()
    .regex(/^[a-z,]+$/, "weekdays は CSV (例: sat,sun)")
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        v
          .split(",")
          .every((d) => (WEEKDAY_VALUES as readonly string[]).includes(d)),
      "weekdays は sun,mon,tue,wed,thu,fri,sat の組み合わせ",
    ),
  timeFrom: z.string().regex(TIME_RE, "time-from は HH:MM").optional(),
  timeTo: z.string().regex(TIME_RE, "time-to は HH:MM").optional(),
});

export async function runWatch(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound watch <add|list|remove|test>");
  if (sub === "add") return addCmd(args, ctx, opts);
  if (sub === "list") return listCmd(args, ctx, opts);
  if (sub === "remove") return removeCmd(args, ctx, opts);
  if (sub === "test") return testCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: watch ${sub}`);
}

async function addCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(addInput, {
    teamId: requireFlag(args.flags, "team"),
    label: optionalFlag(args.flags, "label"),
    source: optionalFlag(args.flags, "source"),
    facilityPattern: optionalFlag(args.flags, "facility"),
    weekdays: optionalFlag(args.flags, "weekdays"),
    timeFrom: optionalFlag(args.flags, "time-from"),
    timeTo: optionalFlag(args.flags, "time-to"),
  });
  const watch = await addGroundWatch(ctx, {
    teamId: data.teamId,
    label: data.label ?? null,
    source: data.source ?? null,
    facilityPattern: data.facilityPattern ?? null,
    weekdays: data.weekdays ?? null,
    timeFrom: data.timeFrom ?? null,
    timeTo: data.timeTo ?? null,
  });
  emit(
    watch,
    `watch を追加しました: ${watch.id} (${watch.label ?? "(無名)"})`,
    opts,
  );
}

async function listCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const watches = await listGroundWatches(ctx, teamId);
  emit(
    watches,
    formatRows(watches, [
      "id",
      "label",
      "source",
      "facility_pattern",
      "weekdays",
      "time_from",
      "time_to",
      "enabled",
    ]),
    opts,
  );
}

async function removeCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new UsageError("使い方: mound watch remove <ID>");
  const removed = await removeGroundWatch(ctx, id);
  emit(
    { ok: removed, id },
    removed
      ? `watch を削除しました: ${id}`
      : `該当する watch が見つかりません: ${id}`,
    opts,
  );
}

async function testCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  // 全 ground_slots に対して team の watches を適用する。
  // 大規模 DB では遅い可能性があるが、Phase 1 のスコープでは現実的。
  const slots = await listGroundSlots(ctx, {});
  const matched = await filterSlotsByTeamWatches(ctx, teamId, slots);
  emit(
    { count: matched.length, slots: matched },
    matched.length === 0
      ? "現在登録されている watch に合致する slot はありません"
      : [
          `${matched.length} 件マッチ`,
          formatRows(matched, [
            "source",
            "facility_name",
            "date_iso",
            "time_range",
            "status",
          ]),
        ].join("\n"),
    opts,
  );
}
