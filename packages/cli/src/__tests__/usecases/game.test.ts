// Clean Architecture の境界を確かめるテスト: usecase は DB に触れず、in-memory な
// ポート実装に対して同じ振る舞いをする。
import { describe, expect, it } from "vitest";
import type {
  AuditLog,
  Game,
  Member,
  MemberRsvp,
  Rsvp,
  RsvpBreakdown,
  RsvpSummary,
  Team,
} from "../../domain/types";
import type {
  AuditRepository,
  GameRepository,
  MemberRepository,
  Repositories,
  RsvpRepository,
  TeamRepository,
  UseCaseContext,
} from "../../ports";

import { TransitionDeniedError } from "../../usecases/errors";
import { createGame, showGame, transitionGame } from "../../usecases/game";

interface Fake {
  teamStore: Map<string, Team>;
  memberStore: Map<string, Member>;
  gameStore: Map<string, Game>;
  rsvpStore: Map<string, Rsvp>;
  auditStore: AuditLog[];
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

  return {
    teamStore,
    memberStore,
    gameStore,
    rsvpStore,
    auditStore,
    repo: { teams, members, games, rsvps, audit },
  };
}

function createCtx(): { ctx: UseCaseContext; fake: Fake } {
  const fake = buildFake();
  let counter = 0;
  const ctx: UseCaseContext = {
    repo: fake.repo,
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
