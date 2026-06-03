import { describe, expect, it } from "vitest";
import type {
  Game,
  GroundSlot,
  NotificationChannel,
  Team,
} from "../../domain/types";
import type {
  GroundSlotRepository,
  NotificationChannelRepository,
  NotificationDeliveryResult,
  NotificationSender,
  Repositories,
  TeamRepository,
  UseCaseContext,
} from "../../ports";
import {
  addNotificationChannel,
  listNotificationChannels,
  notifyGameTransition,
  notifyGroundCancellation,
  removeNotificationChannel,
  testNotificationChannel,
} from "../../usecases/notification";

interface Fake {
  teams: Map<string, Team>;
  channels: Map<string, NotificationChannel>;
  notifierCalls: Array<{ channel: NotificationChannel; message: string }>;
  ctx: UseCaseContext;
}

function buildFake(opts?: { senderError?: Error }): Fake {
  const teams = new Map<string, Team>();
  const channels = new Map<string, NotificationChannel>();
  const notifierCalls: Array<{
    channel: NotificationChannel;
    message: string;
  }> = [];

  const teamRepo: TeamRepository = {
    insert: async (t) => {
      teams.set(t.id, t);
      return t;
    },
    list: async () => Array.from(teams.values()),
    get: async (id) => teams.get(id) ?? null,
    update: async (t) => {
      teams.set(t.id, t);
      return t;
    },
    remove: async (id) => teams.delete(id),
  };

  const notificationRepo: NotificationChannelRepository = {
    insert: async (c) => {
      channels.set(c.id, c);
      return c;
    },
    list: async (teamId) =>
      Array.from(channels.values()).filter((c) => c.team_id === teamId),
    listEnabled: async (teamId) =>
      Array.from(channels.values()).filter(
        (c) => c.team_id === teamId && c.enabled,
      ),
    get: async (id) => channels.get(id) ?? null,
    remove: async (id) => channels.delete(id),
  };

  const stub = new Proxy({}, { get: () => async () => null }) as never;

  // GroundSlotRepository だけは型を埋めるためのスタブ。本テストでは使わない。
  const groundSlots: GroundSlotRepository = stub;

  // groundWatches は filterSlotsByTeamWatches が listEnabled の戻り値の .length を
  // 触るため、Proxy の "全部 null を返す" stub では落ちる。明示的に空配列を返す。
  const emptyWatches = {
    insert: async (w: never) => w,
    list: async () => [],
    listEnabled: async () => [],
    get: async () => null,
    remove: async () => false,
  } as never;

  const repo: Repositories = {
    teams: teamRepo,
    members: stub,
    games: stub,
    rsvps: stub,
    audit: stub,
    groundSlots,
    notifications: notificationRepo,
    groundWatches: emptyWatches,
    observations: stub,
    knowledge: stub,
    settlements: stub,
    backup: stub,
  };

  const notifier: NotificationSender = {
    send: async (channel, message): Promise<NotificationDeliveryResult> => {
      notifierCalls.push({ channel, message });
      if (opts?.senderError) throw opts.senderError;
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: true,
        status_code: null,
        error: null,
      };
    },
  };

  let seq = 0;
  const ctx: UseCaseContext = {
    repo,
    notifier,
    now: () => new Date("2026-05-22T10:00:00.000Z"),
    newId: () => `n-${++seq}`,
  };

  return { teams, channels, notifierCalls, ctx };
}

async function seedTeam(fake: Fake, id: string): Promise<void> {
  await fake.ctx.repo.teams.insert({
    id,
    name: id,
    home_area: null,
    created_at: "x",
    updated_at: "x",
  });
}

describe("addNotificationChannel", () => {
  describe("チームが存在するとき", () => {
    it("enabled=true で保存される", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      const channel = await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/abc",
        secret: null,
        target: null,
        label: "main",
      });
      expect(channel.id).toBe("n-1");
      expect(channel.enabled).toBe(true);
      expect(channel.kind).toBe("DISCORD");
    });
  });

  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const fake = buildFake();
      await expect(
        addNotificationChannel(fake.ctx, {
          teamId: "ghost",
          kind: "DISCORD",
          webhookUrl: "https://discord.com/api/webhooks/abc",
          secret: null,
          target: null,
          label: null,
        }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });
});

describe("listNotificationChannels", () => {
  describe("複数チームのとき", () => {
    it("指定チームの channel だけ返す", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      await seedTeam(fake, "t2");
      await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      await addNotificationChannel(fake.ctx, {
        teamId: "t2",
        kind: "SLACK",
        webhookUrl: "https://hooks.slack.com/y",
        secret: null,
        target: null,
        label: null,
      });
      const onlyT1 = await listNotificationChannels(fake.ctx, "t1");
      expect(onlyT1).toHaveLength(1);
      expect(onlyT1[0]?.team_id).toBe("t1");
    });
  });
});

describe("removeNotificationChannel", () => {
  describe("存在する ID のとき", () => {
    it("true を返して以後 list に出ない", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      const c = await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      const ok = await removeNotificationChannel(fake.ctx, c.id);
      expect(ok).toBe(true);
      expect(await listNotificationChannels(fake.ctx, "t1")).toEqual([]);
    });
  });

  describe("存在しない ID のとき", () => {
    it("false を返す", async () => {
      const fake = buildFake();
      const ok = await removeNotificationChannel(fake.ctx, "missing");
      expect(ok).toBe(false);
    });
  });
});

describe("testNotificationChannel", () => {
  describe("チャネルが存在するとき", () => {
    it("notifier に send を呼んで結果を返す", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      const c = await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      const result = await testNotificationChannel(fake.ctx, c.id, "hi");
      expect(result?.ok).toBe(true);
      expect(fake.notifierCalls).toHaveLength(1);
      expect(fake.notifierCalls[0]?.message).toBe("hi");
    });
  });

  describe("チャネルが存在しないとき", () => {
    it("null を返し send は呼ばれない", async () => {
      const fake = buildFake();
      const result = await testNotificationChannel(fake.ctx, "missing", "x");
      expect(result).toBeNull();
      expect(fake.notifierCalls).toHaveLength(0);
    });
  });
});

describe("notifyGameTransition", () => {
  describe("enabled channel が複数あるとき", () => {
    it("全 channel に message を送る", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "SLACK",
        webhookUrl: "https://hooks.slack.com/y",
        secret: null,
        target: null,
        label: null,
      });
      const game: Game = {
        id: "g1",
        team_id: "t1",
        title: "練習試合",
        status: "CONFIRMED",
        game_date: "2026-06-01",
        ground_name: "公園グラウンド",
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      };
      const results = await notifyGameTransition(
        fake.ctx,
        game,
        "COLLECTING",
        "CONFIRMED",
      );
      expect(results).toHaveLength(2);
      const messages = fake.notifierCalls.map((c) => c.message);
      expect(messages[0]).toContain("COLLECTING → CONFIRMED");
      expect(messages[0]).toContain("練習試合");
    });
  });

  describe("channel が無いとき", () => {
    it("notifier を呼ばず空配列を返す", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      const game: Game = {
        id: "g1",
        team_id: "t1",
        title: "x",
        status: "DRAFT",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      };
      const results = await notifyGameTransition(
        fake.ctx,
        game,
        "DRAFT",
        "COLLECTING",
      );
      expect(results).toEqual([]);
      expect(fake.notifierCalls).toEqual([]);
    });
  });

  describe("notifier が例外を投げるとき", () => {
    it("失敗結果を ok=false で返し、伝播はしない", async () => {
      const fake = buildFake({ senderError: new Error("network down") });
      await seedTeam(fake, "t1");
      await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      const game: Game = {
        id: "g1",
        team_id: "t1",
        title: "x",
        status: "CONFIRMED",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      };
      const results = await notifyGameTransition(
        fake.ctx,
        game,
        "COLLECTING",
        "CONFIRMED",
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.ok).toBe(false);
      expect(results[0]?.error).toContain("network down");
    });
  });
});

describe("notifyGroundCancellation", () => {
  describe("slot が 0 件のとき", () => {
    it("notifier を呼ばずに空配列を返す", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      const results = await notifyGroundCancellation(fake.ctx, "t1", []);
      expect(results).toEqual([]);
      expect(fake.notifierCalls).toEqual([]);
    });
  });

  describe("slot が複数あるとき", () => {
    it("先頭 10 件までを含む 1 通を送る", async () => {
      const fake = buildFake();
      await seedTeam(fake, "t1");
      await addNotificationChannel(fake.ctx, {
        teamId: "t1",
        kind: "DISCORD",
        webhookUrl: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
      });
      const slots: GroundSlot[] = Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        slot_key: `k${i}`,
        source: "yokohama",
        facility_name: `球場${i}`,
        date_iso: "2026-06-15",
        date_raw: "2026/06/15",
        time_range: "09:00-12:00",
        status: null,
        raw: "",
        scraped_at: "x",
        first_seen_at: "x",
        ingested_at: "x",
      }));
      const results = await notifyGroundCancellation(fake.ctx, "t1", slots);
      expect(results).toHaveLength(1);
      const message = fake.notifierCalls[0]?.message ?? "";
      expect(message).toContain("12 件の空き");
      expect(message).toContain("球場0");
      expect(message).toContain("ほか 2 件");
    });
  });
});
