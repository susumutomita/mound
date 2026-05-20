import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type DbClient, migrate, openDb } from "../adapters/libsql/client";
import { buildRepositories } from "../adapters/libsql/repositories";
import type { Game, Member, Rsvp, Team } from "../domain/types";
import type { Repositories } from "../ports";

function createTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    name: "Mound BB",
    home_area: "横浜",
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    team_id: "team-1",
    name: "山田",
    email: null,
    role: "MEMBER",
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

function createGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    team_id: "team-1",
    title: "練習試合",
    status: "DRAFT",
    game_date: "2026-06-01",
    ground_name: null,
    min_players: 9,
    note: null,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

function createRsvp(overrides: Partial<Rsvp> = {}): Rsvp {
  return {
    id: "rsvp-1",
    game_id: "game-1",
    member_id: "member-1",
    response: "AVAILABLE",
    responded_at: "2026-05-20T00:00:00.000Z",
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("openDb", () => {
  describe("存在しないネスト dir の file: URL を渡したとき", () => {
    it("親ディレクトリを作成して接続できる", async () => {
      const root = mkdtempSync(join(tmpdir(), "mound-openDb-"));
      try {
        const nested = join(root, "deep", "nested", "mound.db");
        const db = openDb({ url: `file:${nested}` });
        await migrate(db);
        const repo = buildRepositories(db);
        await repo.teams.insert(createTeam());
        const t = await repo.teams.get("team-1");
        expect(t?.name).toBe("Mound BB");
        expect(existsSync(nested)).toBe(true);
        db.close();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});

describe("Repositories", () => {
  let db: DbClient;
  let repo: Repositories;

  beforeEach(async () => {
    db = openDb({ url: ":memory:" });
    await migrate(db);
    repo = buildRepositories(db);
  });

  describe("Team を作って取得するとき", () => {
    it("挿入した内容で取得できる", async () => {
      const team = createTeam();
      await repo.teams.insert(team);
      const fetched = await repo.teams.get("team-1");
      expect(fetched).toEqual(team);
    });
  });

  describe("RSVP を upsert するとき", () => {
    beforeEach(async () => {
      await repo.teams.insert(createTeam());
      await repo.members.insert(createMember());
      await repo.games.insert(createGame());
    });

    it("同じ (game, member) なら更新される", async () => {
      await repo.rsvps.upsert(createRsvp({ response: "MAYBE" }));
      await repo.rsvps.upsert(
        createRsvp({
          id: "rsvp-2",
          response: "AVAILABLE",
          responded_at: "2026-05-21T00:00:00.000Z",
          updated_at: "2026-05-21T00:00:00.000Z",
        }),
      );
      const rsvps = await repo.rsvps.list("game-1");
      expect(rsvps.length).toBe(1);
      expect(rsvps[0]?.response).toBe("AVAILABLE");
    });
  });

  describe("RSVP サマリを集計するとき", () => {
    beforeEach(async () => {
      await repo.teams.insert(createTeam());
      await repo.games.insert(createGame());
      for (let i = 0; i < 12; i++) {
        await repo.members.insert(
          createMember({ id: `member-${i}`, name: `メンバー${i}` }),
        );
      }
    });

    it("回答済み・未回答を正しく数える", async () => {
      await repo.rsvps.upsert(
        createRsvp({ id: "r1", member_id: "member-0", response: "AVAILABLE" }),
      );
      await repo.rsvps.upsert(
        createRsvp({ id: "r2", member_id: "member-1", response: "AVAILABLE" }),
      );
      await repo.rsvps.upsert(
        createRsvp({
          id: "r3",
          member_id: "member-2",
          response: "UNAVAILABLE",
        }),
      );
      await repo.rsvps.upsert(
        createRsvp({ id: "r4", member_id: "member-3", response: "MAYBE" }),
      );

      const summary = await repo.rsvps.summarize("game-1", "team-1");
      expect(summary).toEqual({
        available: 2,
        unavailable: 1,
        maybe: 1,
        no_response: 8,
      });
    });
  });
});
