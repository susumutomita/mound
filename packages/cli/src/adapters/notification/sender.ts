import type { NotificationChannel } from "../../domain/types";
import type {
  NotificationDeliveryResult,
  NotificationSender,
} from "../../ports";

// 各 kind に対する HTTP request の組み立て。
//   DISCORD: webhook URL に POST { content }
//   SLACK:   incoming webhook URL に POST { text }
//   LINE:    Messaging API push に POST { to, messages } + Authorization: Bearer secret
function buildRequest(
  channel: NotificationChannel,
  message: string,
): { url: string; init: RequestInit } | { error: string } {
  if (channel.kind === "DISCORD") {
    return {
      url: channel.webhook_url,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: message }),
      },
    };
  }
  if (channel.kind === "SLACK") {
    return {
      url: channel.webhook_url,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message }),
      },
    };
  }
  if (channel.kind === "LINE") {
    if (!channel.secret || !channel.target) {
      return {
        error:
          "LINE は secret (channel access token) と target (userId/groupId) が必須です",
      };
    }
    return {
      url: channel.webhook_url,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${channel.secret}`,
        },
        body: JSON.stringify({
          to: channel.target,
          messages: [{ type: "text", text: message }],
        }),
      },
    };
  }
  return { error: `未対応の kind: ${String(channel.kind)}` };
}

// 実 HTTP を叩く sender。fetch のタイムアウトは 8 秒。
export class HttpNotificationSender implements NotificationSender {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(
    channel: NotificationChannel,
    message: string,
  ): Promise<NotificationDeliveryResult> {
    const built = buildRequest(channel, message);
    if ("error" in built) {
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: false,
        status_code: null,
        error: built.error,
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await this.fetchImpl(built.url, {
        ...built.init,
        signal: controller.signal,
      });
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: res.ok,
        status_code: res.status,
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: false,
        status_code: null,
        error: msg,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// テスト / dev 用: stderr に「送信したつもり」を出すだけ。HTTP は叩かない。
// MOUND_NOTIFY_MODE=log-only でこちらに切り替える。
export class LogNotificationSender implements NotificationSender {
  constructor(
    private readonly write: (line: string) => void = (l) =>
      process.stderr.write(`${l}\n`),
  ) {}

  async send(
    channel: NotificationChannel,
    message: string,
  ): Promise<NotificationDeliveryResult> {
    this.write(
      `[notify:${channel.kind}] team=${channel.team_id} label=${channel.label ?? "-"} message=${JSON.stringify(message)}`,
    );
    return {
      channel_id: channel.id,
      channel_kind: channel.kind,
      ok: true,
      status_code: null,
      error: null,
    };
  }
}

// チャネル 1 件も無いとき / notifier が無効化されているときに使う no-op。
export class NoopNotificationSender implements NotificationSender {
  async send(
    channel: NotificationChannel,
  ): Promise<NotificationDeliveryResult> {
    return {
      channel_id: channel.id,
      channel_kind: channel.kind,
      ok: true,
      status_code: null,
      error: null,
    };
  }
}

// env を見て適切な NotificationSender を選ぶ。
//   MOUND_NOTIFY_MODE === "disabled" -> Noop
//   MOUND_NOTIFY_MODE === "log-only" -> Log
//   それ以外 / unset                  -> Http
export function buildNotifierFromEnv(
  env: Record<string, string | undefined>,
): NotificationSender {
  const mode = env.MOUND_NOTIFY_MODE;
  if (mode === "disabled") return new NoopNotificationSender();
  if (mode === "log-only") return new LogNotificationSender();
  return new HttpNotificationSender();
}
