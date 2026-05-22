import { z } from "zod";
import { NOTIFICATION_KINDS } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  addNotificationChannel,
  listNotificationChannels,
  removeNotificationChannel,
  testNotificationChannel,
} from "../../../usecases/notification";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const addInput = z.object({
  teamId: z.string().min(1),
  kind: z.enum(NOTIFICATION_KINDS),
  webhookUrl: z.string().url("--webhook は URL を指定してください"),
  secret: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  label: z.string().max(80).optional(),
});

export async function runNotify(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound notify <add|list|remove|test>");
  if (sub === "add") return addCmd(args, ctx, opts);
  if (sub === "list") return listCmd(args, ctx, opts);
  if (sub === "remove") return removeCmd(args, ctx, opts);
  if (sub === "test") return testCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: notify ${sub}`);
}

async function addCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(addInput, {
    teamId: requireFlag(args.flags, "team"),
    kind: requireFlag(args.flags, "kind"),
    webhookUrl: requireFlag(args.flags, "webhook"),
    secret: optionalFlag(args.flags, "secret"),
    target: optionalFlag(args.flags, "target"),
    label: optionalFlag(args.flags, "label"),
  });
  const channel = await addNotificationChannel(ctx, {
    teamId: data.teamId,
    kind: data.kind,
    webhookUrl: data.webhookUrl,
    secret: data.secret ?? null,
    target: data.target ?? null,
    label: data.label ?? null,
  });
  emit(
    channel,
    `通知チャネルを追加しました: ${channel.id} (${channel.kind})`,
    opts,
  );
}

async function listCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const channels = await listNotificationChannels(ctx, teamId);
  // webhook_url / secret はサマリ列には出さない (秘匿)
  emit(
    channels,
    formatRows(channels, ["id", "kind", "label", "enabled", "created_at"]),
    opts,
  );
}

async function removeCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new UsageError("使い方: mound notify remove <ID>");
  const removed = await removeNotificationChannel(ctx, id);
  emit(
    { ok: removed, id },
    removed
      ? `通知チャネルを削除しました: ${id}`
      : `該当する通知チャネルが見つかりません: ${id}`,
    opts,
  );
}

async function testCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new UsageError("使い方: mound notify test <ID>");
  const message =
    optionalFlag(args.flags, "message") ??
    "mound からのテスト通知です (mound notify test)";
  const result = await testNotificationChannel(ctx, id, message);
  if (!result) {
    throw new UsageError(`該当する通知チャネルが見つかりません: ${id}`);
  }
  emit(
    result,
    result.ok
      ? `送信成功 (${result.channel_kind})`
      : `送信失敗 (${result.channel_kind}): ${result.error ?? "unknown"}`,
    opts,
  );
}
