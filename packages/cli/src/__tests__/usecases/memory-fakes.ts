// usecase テスト用の in-memory ポート実装 (fake)。Clean Architecture の境界を
// 守るため、usecase は DB ではなくこの fake に対してテストする。
//
// - buildObservationRepo / buildKnowledgeRepo: チーム記憶レイヤの 2 repo だけが
//   欲しい既存テスト向け (型を満たすための最小実装)。
// - buildFakeContext: 全 Repositories を備えた UseCaseContext を返す (新規テスト向け)。
import type {
  AuditLog,
  Game,
  GroundSlot,
  GroundWatch,
  Member,
  MemberRsvp,
  NotificationChannel,
  Observation,
  Rsvp,
  RsvpBreakdown,
  Settlement,
  SettlementShare,
  Team,
  TeamKnowledge,
} from "../../domain/types";
import type {
  NotificationSender,
  ObservationRepository,
  Repositories,
  SettlementRepository,
  TeamKnowledgeRepository,
  UseCaseContext,
} from "../../ports";

export function buildObservationRepo(
  store: Map<string, Observation> = new Map(),
): { store: Map<string, Observation>; repo: ObservationRepository } {
  const repo: ObservationRepository = {
    insert: async (o) => {
      store.set(o.id, o);
      return o;
    },
    list: async (f) =>
      Array.from(store.values())
        .filter(
          (o) =>
            o.team_id === f.teamId &&
            (!f.kind || o.kind === f.kind) &&
            (!f.memberId || o.member_id === f.memberId),
        )
        .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1)),
  };
  return { store, repo };
}

export function buildKnowledgeRepo(
  store: Map<string, TeamKnowledge> = new Map(),
): { store: Map<string, TeamKnowledge>; repo: TeamKnowledgeRepository } {
  const repo: TeamKnowledgeRepository = {
    insert: async (k) => {
      store.set(k.id, k);
      return k;
    },
    update: async (k) => {
      store.set(k.id, k);
      return k;
    },
    getByKey: async (teamId, memberId, key) =>
      Array.from(store.values()).find(
        (k) =>
          k.team_id === teamId && k.member_id === memberId && k.key === key,
      ) ?? null,
    list: async (f) =>
      Array.from(store.values()).filter(
        (k) =>
          k.team_id === f.teamId &&
          (!f.category || k.category === f.category) &&
          (!f.memberId || k.member_id === f.memberId) &&
          (!f.key || k.key === f.key),
      ),
    remove: async (id) => store.delete(id),
  };
  return { store, repo };
}

export function buildSettlementRepo(
  settlements: Map<string, Settlement> = new Map(),
  shares: Map<string, SettlementShare> = new Map(),
): {
  settlements: Map<string, Settlement>;
  shares: Map<string, SettlementShare>;
  repo: SettlementRepository;
} {
  const repo: SettlementRepository = {
    insert: async (s) => {
      settlements.set(s.id, s);
      return s;
    },
    getByGame: async (gameId) =>
      Array.from(settlements.values()).find((s) => s.game_id === gameId) ??
      null,
    updateStatus: async (id, status, updatedAt) => {
      const s = settlements.get(id);
      if (s) settlements.set(id, { ...s, status, updated_at: updatedAt });
    },
    insertShare: async (sh) => {
      shares.set(sh.id, sh);
      return sh;
    },
    listShares: async (settlementId) =>
      Array.from(shares.values()).filter(
        (sh) => sh.settlement_id === settlementId,
      ),
    getShare: async (settlementId, memberId) =>
      Array.from(shares.values()).find(
        (sh) => sh.settlement_id === settlementId && sh.member_id === memberId,
      ) ?? null,
    updateSharePaid: async (id, paid, paidAt, updatedAt) => {
      const sh = shares.get(id);
      if (sh) {
        shares.set(id, {
          ...sh,
          paid,
          paid_at: paidAt,
          updated_at: updatedAt,
        });
      }
    },
  };
  return { settlements, shares, repo };
}

export interface FakeStores {
  teams: Map<string, Team>;
  members: Map<string, Member>;
  games: Map<string, Game>;
  rsvps: Map<string, Rsvp>;
  audit: AuditLog[];
  observations: Map<string, Observation>;
  knowledge: Map<string, TeamKnowledge>;
  notifierCalls: Array<{ channel: NotificationChannel; message: string }>;
}

export interface FakeContext {
  ctx: UseCaseContext;
  stores: FakeStores;
}

// 全 Repositories を備えた最小 fake。記憶レイヤのテストで主に使うのは
// teams / members / audit / observations / knowledge。残りは型を満たす最小実装。
export function buildFakeContext(
  now = "2026-06-03T09:00:00.000Z",
): FakeContext {
  const teams = new Map<string, Team>();
  const members = new Map<string, Member>();
  const games = new Map<string, Game>();
  const rsvps = new Map<string, Rsvp>();
  const audit: AuditLog[] = [];
  const { store: observations, repo: observationRepo } = buildObservationRepo();
  const { store: knowledge, repo: knowledgeRepo } = buildKnowledgeRepo();
  const notifierCalls: Array<{
    channel: NotificationChannel;
    message: string;
  }> = [];

  const breakdown = async (
    gameId: string,
    teamId: string,
  ): Promise<RsvpBreakdown> => {
    const rows: MemberRsvp[] = Array.from(members.values())
      .filter((m) => m.team_id === teamId)
      .map((m) => {
        const r = rsvps.get(`${gameId}:${m.id}`);
        return {
          member_id: m.id,
          member_name: m.name,
          member_role: m.role,
          response: r?.response ?? "NO_RESPONSE",
          responded_at: r?.responded_at ?? null,
        };
      });
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

  const repo: Repositories = {
    teams: {
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
    },
    members: {
      insert: async (m) => {
        members.set(m.id, m);
        return m;
      },
      list: async (teamId) =>
        Array.from(members.values()).filter((m) => m.team_id === teamId),
      get: async (id) => members.get(id) ?? null,
      update: async (m) => {
        members.set(m.id, m);
        return m;
      },
      remove: async (id) => members.delete(id),
    },
    games: {
      insert: async (g) => {
        games.set(g.id, g);
        return g;
      },
      list: async (filter) =>
        Array.from(games.values()).filter(
          (g) =>
            (!filter.teamId || g.team_id === filter.teamId) &&
            (!filter.status || g.status === filter.status),
        ),
      get: async (id) => games.get(id) ?? null,
      updateStatus: async (id, status, updatedAt) => {
        const g = games.get(id);
        if (g) games.set(id, { ...g, status, updated_at: updatedAt });
      },
    },
    rsvps: {
      upsert: async (r) => {
        rsvps.set(`${r.game_id}:${r.member_id}`, r);
        return r;
      },
      list: async (gameId) =>
        Array.from(rsvps.values()).filter((r) => r.game_id === gameId),
      listWithMembers: async (gameId, teamId) => {
        const b = await breakdown(gameId, teamId);
        return [...b.available, ...b.unavailable, ...b.maybe, ...b.no_response];
      },
      breakdown,
      summarize: async (gameId, teamId) => {
        const b = await breakdown(gameId, teamId);
        return {
          available: b.available.length,
          unavailable: b.unavailable.length,
          maybe: b.maybe.length,
          no_response: b.no_response.length,
        };
      },
    },
    audit: {
      insert: async (l) => {
        audit.push(l);
        return l;
      },
      list: async (targetType, targetId) =>
        audit.filter(
          (l) => l.target_type === targetType && l.target_id === targetId,
        ),
    },
    groundSlots: {
      upsert: async (s: GroundSlot) => s,
      list: async () => [],
      listNewerThan: async () => [],
      getByKey: async () => null,
    },
    notifications: {
      insert: async (c: NotificationChannel) => c,
      list: async () => [],
      listEnabled: async () => [],
      get: async () => null,
      remove: async () => false,
    },
    groundWatches: {
      insert: async (w: GroundWatch) => w,
      list: async () => [],
      listEnabled: async () => [],
      get: async () => null,
      remove: async () => false,
    },
    observations: observationRepo,
    knowledge: knowledgeRepo,
    settlements: buildSettlementRepo().repo,
    backup: {
      exportAll: async () => [],
      importAll: async (rows) => rows.length,
    },
  };

  const notifier: NotificationSender = {
    send: async (channel, message) => {
      notifierCalls.push({ channel, message });
      return {
        channel_id: channel.id,
        channel_kind: channel.kind,
        ok: true,
        status_code: null,
        error: null,
      };
    },
  };

  let counter = 0;
  const ctx: UseCaseContext = {
    repo,
    notifier,
    now: () => new Date(now),
    newId: () => `id-${++counter}`,
  };

  return {
    ctx,
    stores: {
      teams,
      members,
      games,
      rsvps,
      audit,
      observations,
      knowledge,
      notifierCalls,
    },
  };
}
