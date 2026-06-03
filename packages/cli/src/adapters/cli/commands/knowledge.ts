import { z } from "zod";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_ORIGINS } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  forgetKnowledge,
  getKnowledge,
  listKnowledge,
  recordKnowledge,
} from "../../../usecases/knowledge";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const setInput = z.object({
  teamId: z.string().min(1),
  key: z.string().min(1, "--key は必須です"),
  value: z.string().min(1, "--value は必須です"),
  category: z.enum(KNOWLEDGE_CATEGORIES).default("NOTE"),
  memberId: z.string().min(1).optional(),
  origin: z.enum(KNOWLEDGE_ORIGINS).default("HUMAN"),
  confidence: z.coerce
    .number()
    .min(0, "--confidence は 0–1")
    .max(1, "--confidence は 0–1")
    .default(1),
  source: z.string().max(120).optional(),
});

export async function runKnowledge(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub)
    throw new UsageError("使い方: mound knowledge <set|list|get|forget>");
  if (sub === "set") return setCmd(args, ctx, opts);
  if (sub === "list") return listCmd(args, ctx, opts);
  if (sub === "get") return getCmd(args, ctx, opts);
  if (sub === "forget") return forgetCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: knowledge ${sub}`);
}

async function setCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(setInput, {
    teamId: requireFlag(args.flags, "team"),
    key: requireFlag(args.flags, "key"),
    value: requireFlag(args.flags, "value"),
    category: optionalFlag(args.flags, "category"),
    memberId: optionalFlag(args.flags, "member"),
    origin: optionalFlag(args.flags, "origin"),
    confidence: optionalFlag(args.flags, "confidence"),
    source: optionalFlag(args.flags, "source"),
  });
  const entry = await recordKnowledge(ctx, {
    teamId: data.teamId,
    key: data.key,
    value: data.value,
    category: data.category,
    memberId: data.memberId ?? null,
    origin: data.origin,
    confidence: data.confidence,
    source: data.source ?? null,
  });
  emit(
    entry,
    `決め事を記録: ${entry.key} = ${entry.value} ` +
      `(origin=${entry.origin}, confidence=${entry.confidence}, evidence=${entry.evidence_count})`,
    opts,
  );
}

async function listCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const category = optionalFlag(args.flags, "category");
  const memberId = optionalFlag(args.flags, "member");
  const key = optionalFlag(args.flags, "key");
  const entries = await listKnowledge(ctx, {
    teamId,
    ...(category
      ? { category: parseOrUsage(z.enum(KNOWLEDGE_CATEGORIES), category) }
      : {}),
    ...(memberId ? { memberId } : {}),
    ...(key ? { key } : {}),
  });
  emit(
    entries,
    formatRows(entries, [
      "category",
      "key",
      "value",
      "origin",
      "confidence",
      "evidence_count",
      "member_id",
    ]),
    opts,
  );
}

async function getCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const key = requireFlag(args.flags, "key");
  const memberId = optionalFlag(args.flags, "member") ?? null;
  const entry = await getKnowledge(ctx, teamId, key, memberId);
  if (!entry) {
    emit({ found: false, team_id: teamId, key }, `該当なし: ${key}`, opts);
    return;
  }
  emit(entry, `${entry.key} = ${entry.value}`, opts);
}

async function forgetCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new UsageError("使い方: mound knowledge forget <ID>");
  const removed = await forgetKnowledge(ctx, id);
  emit(
    { ok: removed, id },
    removed
      ? `決め事を削除しました: ${id}`
      : `該当する決め事が見つかりません: ${id}`,
    opts,
  );
}
