// Clean Architecture の境界を確かめるテスト: usecase は DB に触れず、in-memory な
// ポート実装に対して同じ振る舞いをする。
import { describe, expect, it } from "vitest";
import type {
  AuditLog,
  Game,
  GroundSlot,
  GroundWatch,
  Member,
  MemberRsvp,
  NotificationChannel,
  Rsvp,
  RsvpBreakdown,
  RsvpSummary,
  Team,
} from "../../domain/types";
import type {
  AuditRepository,
  GameRepository,
  GroundSlotRepository,
  GroundWatchRepository,
  MemberRepository,
  NotificationChannelRepository,
  NotificationSender,
  Repositories,
  RsvpRepository,
  TeamRepository,
  UseCaseContext,
} from "../../ports";

import { TransitionDeniedError } from "../../usecases/errors";
import { createGame, showGame, transitionGame } from "../../usecases/game";
import {
  buildKnowledgeRepo,
  buildObservationRepo,
  buildSettlementRepo,
} from "./memory-fakes";

interface Fake {
  teamStore: Map<string, Team>;
  memberStore: Map<string, Member>;
  gameStore: Map<string, Game>;
  rsvpStore: Map<string, Rsvp>;
  auditStore: AuditLog[];
  groundStore: Map<string, GroundSlot>;
  notificationStore: Map<string, NotificationChannel>;
  notifierCalls: Array<{ channel: NotificationChannel; message: string }>;
  repo: Repositories;
}

function buildFake(): Fake {
  const teamStore = new Map<string, Team>();
  const memberStore = new Map<string, Member>();
  const gameStore = new Map<string, Game>();
  const rsvpStore = new Map<string, Rsvp>();
  const auditStore: AuditLog[] = [];

  const teams: TeamRepository = {
    insert: async (t) => {
      teamStore.set(t.id, t);
      return t;
    },
    list: async () => Array.from(teamStore.values()),
    get: async (id) => teamStore.get(id) ?? null,
  };

  const members: MemberRepository = {
    insert: async (m) => {
      memberStore.set(m.id, m);
      return m;
    },
    list: async (teamId) =>
      Array.from(memberStore.values()).filter((m) => m.team_id === teamId),
    get: async (id) => memberStore.get(id) ?? null,
  };

  const games: GameRepository = {
    insert: async (g) => {
      gameStore.set(g.id, g);
      return g;
    },
    list: async (filter) =>
      Array.from(gameStore.values()).filter(
        (g) =>
          (!filter.teamId || g.team_id === filter.teamId) &&
          (!filter.status || g.status === filter.status),
      ),
    get: async (id) => gameStore.get(id) ?? null,
    updateStatus: async (id, status, updatedAt) => {
      const g = gameStore.get(id);
      if (g) gameStore.set(id, { ...g, status, updated_at: updatedAt });
    },
  };

  const listWithMembers = async (
    gameId: string,
    teamId: string,
  ): Promise<MemberRsvp[]> => {
    const teamMembers = Array.from(memberStore.values()).filter(
      (m) => m.team_id === teamId,
    );
    return teamMembers.map((m) => {
      const r = rsvpStore.get(`${gameId}:${m.id}`);
      return {
        member_id: m.id,
        member_name: m.name,
        member_role: m.role,
        response: r?.response ?? "NO_RESPONSE",
        responded_at: r?.responded_at ?? null,
      };
    });
  };

  const breakdown = async (
    gameId: string,
    teamId: string,
  ): Promise<RsvpBreakdown> => {
    const rows = await listWithMembers(gameId, teamId);
    const out: RsvpBreakdown = {
      available: [],
      unavailable: [],
      maybe: [],
      no_response: [],
    };
    for (const r of rows) {
      if (r.response === "AVAILABLE") out.available.push(r);
      else if (r.response === "UNAVAILABLE") out.unavailable.push(r);
      else if (r.response === "MAYBE") out.maybe.push(r);
      else out.no_response.push(r);
    }
    return out;
  };

  const rsvps: RsvpRepository = {
    upsert: async (r) => {
      rsvpStore.set(`${r.game_id}:${r.member_id}`, r);
      return r;
    },
    list: async (gameId) =>
      Array.from(rsvpStore.values()).filter((r) => r.game_id === gameId),
    listWithMembers,
    breakdown,
    summarize: async (gameId, teamId): Promise<RsvpSummary> => {
      const b = await breakdown(gameId, teamId);
      return {
        available: b.available.length,
        unavailable: b.unavailable.length,
        maybe: b.maybe.length,
        no_response: b.no_response.length,
      };
    },
  };

  const audit: AuditRepository = {
    insert: async (l) => {
      auditStore.push(l);
      return l;
    },
    list: async (targetType, targetId) =>
      auditStore.filter(
        (l) => l.target_type === targetType && l.target_id === targetId,
      ),
  };

  const groundStore = new Map<string, GroundSlot>();
  const groundSlots: GroundSlotRepository = {
    upsert: async (s) => {
      groundStore.set(s.slot_key, s);
      return s;
    },
    list: async (filter) =>
      Array.from(groundStore.values()).filter(
        (s) =>
          (!filter.source || s.source === filter.source) &&
          (!filter.dateIso || s.date_iso === filter.dateIso),
      ),
    listNewerThan: async (filter) =>
      Array.from(groundStore.values()).filter(
        (s) =>
          s.first_seen_at >= filter.since &&
          (!filter.source || s.source === filter.source) &&
          (!filter.dateIso || s.date_iso === filter.dateIso),
      ),
    getByKey: async (slotKey) => groundStore.get(slotKey) ?? null,
  };

  const notificationStore = new Map<string, NotificationChannel>();
  const notifications: NotificationChannelRepository = {
    insert: async (c) => {
      notificationStore.set(c.id, c);
      return c;
    },
    list: async (teamId) =>
      Array.from(notificationStore.values()).filter(
        (c) => c.team_id === teamId,
      ),
    listEnabled: async (teamId) =>
      Array.from(notificationStore.values()).filter(
        (c) => c.team_id === teamId && c.enabled,
      ),
    get: async (id) => notificationStore.get(id) ?? null,
    remove: async (id) => notificationStore.delete(id),
  };

  const watchStore = new Map<string, GroundWatch>();
  const groundWatches: GroundWatchRepository = {
    insert: async (w) => {
      watchStore.set(w.id, w);
      return w;
    },
    list: async (teamId) =>
      Array.from(watchStore.values()).filter((w) => w.team_id === teamId),
    listEnabled: async (teamId) =>
      Array.from(watchStore.values()).filter(
        (w) => w.team_id === teamId && w.enabled,
      ),
    get: async (id) => watchStore.get(id) ?? null,
    remove: async (id) => watchStore.delete(id),
  };

  return {
    teamStore,
    memberStore,
    gameStore,
    rsvpStore,
    auditStore,
    groundStore,
    notificationStore,
    notifierCalls: [],
    repo: {
      teams,
      members,
      games,
      rsvps,
      audit,
      groundSlots,
      notifications,
      groundWatches,
      observations: buildObservationRepo().repo,
      knowledge: buildKnowledgeRepo().repo,
      settlements: buildSettlementRepo().repo,
    },
  };
}

// 送信を記録するだけの fake notifier。テストから .calls を見て検証する。
function buildFakeNotifier(fake: Fake): NotificationSender {
  return {
    send: async (channel, message) => {
      fake.notifierCalls.push({ channel, message });
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: true,
        status_code: null,
        error: null,
      };
    },
  };
}

function createCtx(): { ctx: UseCaseContext; fake: Fake } {
  const fake = buildFake();
  let counter = 0;
  const ctx: UseCaseContext = {
    repo: fake.repo,
    notifier: buildFakeNotifier(fake),
    now: () => new Date("2026-05-20T09:00:00.000Z"),
    newId: () => `id-${++counter}`,
  };
  return { ctx, fake };
}

describe("createGame use case", () => {
  describe("チームが存在しないとき", () => {
    it("TeamNotFoundError を投げる", async () => {
      const { ctx } = createCtx();
      await expect(
        createGame(ctx, {
          teamId: "nonexistent",
          title: "練習試合",
          date: null,
          ground: null,
          minPlayers: 9,
          note: null,
        }),
      ).rejects.toThrow(/team が存在しません/);
    });
  });

  describe("チームが存在するとき", () => {
    it("DRAFT で保存して監査ログを残す", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "team-1",
        name: "Mound",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      const game = await createGame(ctx, {
        teamId: "team-1",
        title: "練習試合",
        date: null,
        ground: null,
        minPlayers: 9,
        note: null,
      });
      expect(game.status).toBe("DRAFT");
      expect(
        fake.auditStore.find((l) => l.action === "GAME_CREATED"),
      ).toBeTruthy();
    });
  });
});

describe("transitionGame use case", () => {
  describe("通知チャネルがあるとき", () => {
    it("遷移成功後に登録チャネルへ通知を送る", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "練習試合",
        status: "DRAFT",
        game_date: "2026-06-01",
        ground_name: "公園",
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.notifications.insert({
        id: "ch1",
        team_id: "t",
        kind: "DISCORD",
        webhook_url: "https://discord.com/api/webhooks/x",
        secret: null,
        target: null,
        label: null,
        enabled: true,
        created_at: "x",
        updated_at: "x",
      });

      const after = await transitionGame(ctx, "g", "COLLECTING");
      expect(after.status).toBe("COLLECTING");
      expect(fake.notifierCalls).toHaveLength(1);
      expect(fake.notifierCalls[0]?.message).toContain("DRAFT → COLLECTING");
    });
  });

  describe("人数不足のとき", () => {
    it("CONFIRMED への遷移を拒否する", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "COLLECTING",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      await expect(transitionGame(ctx, "g", "CONFIRMED")).rejects.toThrow(
        /最低人数/,
      );
    });

    it("エラーに from / to / available_transitions / rsvp_summary / min_players が載る", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "COLLECTING",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });

      let captured: TransitionDeniedError | undefined;
      try {
        await transitionGame(ctx, "g", "CONFIRMED");
      } catch (e) {
        if (e instanceof TransitionDeniedError) captured = e;
        else throw e;
      }
      expect(captured).toBeInstanceOf(TransitionDeniedError);
      expect(captured?.from).toBe("COLLECTING");
      expect(captured?.to).toBe("CONFIRMED");
      // COLLECTING からは CONFIRMED と CANCELLED に行ける。
      expect(captured?.available_transitions).toEqual(
        expect.arrayContaining(["CONFIRMED", "CANCELLED"]),
      );
      expect(captured?.min_players).toBe(9);
      expect(captured?.rsvp_summary?.available).toBe(0);

      const details = captured?.toDetails();
      expect(details?.from).toBe("COLLECTING");
      expect(details?.available_transitions).toBeDefined();
      expect(details?.min_players).toBe(9);
    });
  });

  describe("不正な遷移先のとき", () => {
    it("available_transitions に有効遷移先が載って rsvp_summary は省かれる", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "DRAFT",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });

      let captured: TransitionDeniedError | undefined;
      try {
        await transitionGame(ctx, "g", "SETTLED");
      } catch (e) {
        if (e instanceof TransitionDeniedError) captured = e;
        else throw e;
      }
      expect(captured?.from).toBe("DRAFT");
      expect(captured?.available_transitions).toEqual(
        expect.arrayContaining(["COLLECTING", "CONFIRMED", "CANCELLED"]),
      );
      // 不正遷移は rsvp/min_players 関係ないが、現実装では設定される。
      // どちらでもよいが details に出ても害は無い。
      const details = captured?.toDetails();
      expect(details?.from).toBe("DRAFT");
    });
  });
});

describe("showGame use case", () => {
  describe("DRAFT 状態のとき", () => {
    it("available_transitions に DRAFT からの全遷移先が載る", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "DRAFT",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      const detail = await showGame(ctx, "g");
      expect(detail.game.status).toBe("DRAFT");
      expect(detail.available_transitions).toEqual(
        expect.arrayContaining(["COLLECTING", "CONFIRMED", "CANCELLED"]),
      );
      expect(detail.available_transitions).not.toContain("COMPLETED");
    });
  });

  describe("game_date と ground_name が揃っているとき", () => {
    it("matching_ground_slots に同日 + ground_name 部分一致の slot だけ載る", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "練習試合",
        status: "CONFIRMED",
        game_date: "2026-06-01",
        ground_name: "三ツ沢",
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      // 取り込み済み slot を 3 件入れて、うち 1 件だけマッチさせる
      const baseSlot = {
        source: "yokohama",
        date_iso: "2026-06-01",
        date_raw: "x",
        time_range: "09:00-12:00",
        status: null,
        raw: "",
        scraped_at: "x",
        first_seen_at: "x",
        ingested_at: "x",
      };
      await fake.repo.groundSlots.upsert({
        id: "s1",
        slot_key: "k1",
        ...baseSlot,
        facility_name: "三ツ沢公園球技場",
      });
      // 別日付なので除外
      await fake.repo.groundSlots.upsert({
        id: "s2",
        slot_key: "k2",
        ...baseSlot,
        date_iso: "2026-06-02",
        facility_name: "三ツ沢公園球技場",
      });
      // 名前不一致なので除外
      await fake.repo.groundSlots.upsert({
        id: "s3",
        slot_key: "k3",
        ...baseSlot,
        facility_name: "岸根公園球技場",
      });

      const detail = await showGame(ctx, "g");
      expect(detail.matching_ground_slots).toHaveLength(1);
      expect(detail.matching_ground_slots[0]?.id).toBe("s1");
    });
  });

  describe("game_date が null のとき", () => {
    it("matching_ground_slots は空配列", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "DRAFT",
        game_date: null,
        ground_name: "三ツ沢",
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      const detail = await showGame(ctx, "g");
      expect(detail.matching_ground_slots).toEqual([]);
    });
  });

  describe("ground_name が null のとき", () => {
    it("matching_ground_slots は空配列", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "CONFIRMED",
        game_date: "2026-06-01",
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      const detail = await showGame(ctx, "g");
      expect(detail.matching_ground_slots).toEqual([]);
    });
  });

  describe("終端 (SETTLED) のとき", () => {
    it("available_transitions は空配列", async () => {
      const { ctx, fake } = createCtx();
      await fake.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await fake.repo.games.insert({
        id: "g",
        team_id: "t",
        title: "x",
        status: "SETTLED",
        game_date: null,
        ground_name: null,
        min_players: 9,
        note: null,
        created_at: "x",
        updated_at: "x",
      });
      const detail = await showGame(ctx, "g");
      expect(detail.available_transitions).toEqual([]);
    });
  });
});
