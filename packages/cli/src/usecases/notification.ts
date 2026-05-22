import type {
  Game,
  GameStatus,
  GroundSlot,
  NotificationChannel,
  NotificationKind,
} from "../domain/types";
import type { NotificationDeliveryResult, UseCaseContext } from "../ports";
import { TeamNotFoundError } from "./errors";

export interface AddChannelInput {
  teamId: string;
  kind: NotificationKind;
  webhookUrl: string;
  secret: string | null;
  target: string | null;
  label: string | null;
}

export async function addNotificationChannel(
  ctx: UseCaseContext,
  input: AddChannelInput,
): Promise<NotificationChannel> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const now = ctx.now().toISOString();
  const channel: NotificationChannel = {
    id: ctx.newId(),
    team_id: team.id,
    kind: input.kind,
    webhook_url: input.webhookUrl,
    secret: input.secret,
    target: input.target,
    label: input.label,
    enabled: true,
    created_at: now,
    updated_at: now,
  };
  return ctx.repo.notifications.insert(channel);
}

export async function listNotificationChannels(
  ctx: UseCaseContext,
  teamId: string,
): Promise<NotificationChannel[]> {
  return ctx.repo.notifications.list(teamId);
}

export async function removeNotificationChannel(
  ctx: UseCaseContext,
  id: string,
): Promise<boolean> {
  return ctx.repo.notifications.remove(id);
}

export async function testNotificationChannel(
  ctx: UseCaseContext,
  id: string,
  message: string,
): Promise<NotificationDeliveryResult | null> {
  const channel = await ctx.repo.notifications.get(id);
  if (!channel) return null;
  return ctx.notifier.send(channel, message);
}

// 共通の送信処理: 失敗しても全 channel に try する。
async function dispatch(
  ctx: UseCaseContext,
  teamId: string,
  message: string,
): Promise<NotificationDeliveryResult[]> {
  const channels = await ctx.repo.notifications.listEnabled(teamId);
  if (channels.length === 0) return [];
  return Promise.all(
    channels.map((c) =>
      ctx.notifier.send(c, message).catch((e: unknown) => ({
        channel_id: c.id,
        channel_kind: c.kind,
        ok: false,
        status_code: null,
        error: e instanceof Error ? e.message : String(e),
      })),
    ),
  );
}

function formatGameTransitionMessage(
  game: Game,
  from: GameStatus,
  to: GameStatus,
): string {
  const date = game.game_date ?? "日付未定";
  const ground = game.ground_name ?? "会場未定";
  const emoji = to === "CONFIRMED" ? "✅" : to === "CANCELLED" ? "❌" : "🔄";
  return [
    `${emoji} 試合の状態が変わりました: ${from} → ${to}`,
    `${game.title}`,
    `${date} / ${ground}`,
  ].join("\n");
}

export async function notifyGameTransition(
  ctx: UseCaseContext,
  game: Game,
  from: GameStatus,
  to: GameStatus,
): Promise<NotificationDeliveryResult[]> {
  const message = formatGameTransitionMessage(game, from, to);
  return dispatch(ctx, game.team_id, message);
}

function formatGroundCancellationMessage(slots: GroundSlot[]): string {
  if (slots.length === 0) return "";
  const head = `🟢 グラウンドに ${slots.length} 件の空きが出ました`;
  const lines = slots.slice(0, 10).map((s) => {
    const date = s.date_iso ?? s.date_raw;
    const time = s.time_range ?? "";
    const status = s.status ? ` [${s.status}]` : "";
    return `- ${date} ${time} ${s.facility_name}${status} (${s.source})`;
  });
  const overflow = slots.length > 10 ? `\n…ほか ${slots.length - 10} 件` : "";
  return [head, ...lines].join("\n") + overflow;
}

export async function notifyGroundCancellation(
  ctx: UseCaseContext,
  teamId: string,
  slots: GroundSlot[],
): Promise<NotificationDeliveryResult[]> {
  if (slots.length === 0) return [];
  const message = formatGroundCancellationMessage(slots);
  return dispatch(ctx, teamId, message);
}
