import type { InValue } from "@libsql/client";
import type {
  AuditLog,
  Game,
  GameStatus,
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
} from "../../ports";
import type { DbClient } from "./client";
import {
  rowToAuditLog,
  rowToGame,
  rowToMember,
  rowToMemberRsvp,
  rowToRsvp,
  rowToTeam,
} from "./row-mappers";

class LibsqlTeamRepository implements TeamRepository {
  constructor(private readonly db: DbClient) {}

  async insert(team: Team): Promise<Team> {
    await this.db.execute({
      sql: `INSERT INTO teams (id, name, home_area, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        team.id,
        team.name,
        team.home_area,
        team.created_at,
        team.updated_at,
      ],
    });
    return team;
  }

  async list(): Promise<Team[]> {
    const r = await this.db.execute(
      "SELECT * FROM teams ORDER BY created_at ASC",
    );
    return r.rows.map(rowToTeam);
  }

  async get(id: string): Promise<Team | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM teams WHERE id = ?",
      args: [id],
    });
    return r.rows[0] ? rowToTeam(r.rows[0]) : null;
  }
}

class LibsqlMemberRepository implements MemberRepository {
  constructor(private readonly db: DbClient) {}

  async insert(member: Member): Promise<Member> {
    await this.db.execute({
      sql: `INSERT INTO members (id, team_id, name, email, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        member.id,
        member.team_id,
        member.name,
        member.email,
        member.role,
        member.created_at,
        member.updated_at,
      ],
    });
    return member;
  }

  async list(teamId: string): Promise<Member[]> {
    const r = await this.db.execute({
      sql: "SELECT * FROM members WHERE team_id = ? ORDER BY created_at ASC",
      args: [teamId],
    });
    return r.rows.map(rowToMember);
  }

  async get(id: string): Promise<Member | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM members WHERE id = ?",
      args: [id],
    });
    return r.rows[0] ? rowToMember(r.rows[0]) : null;
  }
}

class LibsqlGameRepository implements GameRepository {
  constructor(private readonly db: DbClient) {}

  async insert(game: Game): Promise<Game> {
    await this.db.execute({
      sql: `INSERT INTO games (
              id, team_id, title, status, game_date, ground_name,
              min_players, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        game.id,
        game.team_id,
        game.title,
        game.status,
        game.game_date,
        game.ground_name,
        game.min_players,
        game.note,
        game.created_at,
        game.updated_at,
      ],
    });
    return game;
  }

  async list(filter: {
    teamId?: string;
    status?: GameStatus;
  }): Promise<Game[]> {
    const where: string[] = [];
    const args: InValue[] = [];
    if (filter.teamId) {
      where.push("team_id = ?");
      args.push(filter.teamId);
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    const sql = `SELECT * FROM games${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC`;
    const r = await this.db.execute({ sql, args });
    return r.rows.map(rowToGame);
  }

  async get(id: string): Promise<Game | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM games WHERE id = ?",
      args: [id],
    });
    return r.rows[0] ? rowToGame(r.rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: GameStatus,
    updatedAt: string,
  ): Promise<void> {
    await this.db.execute({
      sql: "UPDATE games SET status = ?, updated_at = ? WHERE id = ?",
      args: [status, updatedAt, id],
    });
  }
}

class LibsqlRsvpRepository implements RsvpRepository {
  constructor(private readonly db: DbClient) {}

  async upsert(rsvp: Rsvp): Promise<Rsvp> {
    await this.db.execute({
      sql: `INSERT INTO rsvps (id, game_id, member_id, response, responded_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_id, member_id) DO UPDATE SET
              response = excluded.response,
              responded_at = excluded.responded_at,
              updated_at = excluded.updated_at`,
      args: [
        rsvp.id,
        rsvp.game_id,
        rsvp.member_id,
        rsvp.response,
        rsvp.responded_at,
        rsvp.created_at,
        rsvp.updated_at,
      ],
    });
    const r = await this.db.execute({
      sql: "SELECT * FROM rsvps WHERE game_id = ? AND member_id = ?",
      args: [rsvp.game_id, rsvp.member_id],
    });
    if (!r.rows[0]) throw new Error("rsvp upsert failed");
    return rowToRsvp(r.rows[0]);
  }

  async list(gameId: string): Promise<Rsvp[]> {
    const r = await this.db.execute({
      sql: "SELECT * FROM rsvps WHERE game_id = ? ORDER BY responded_at ASC",
      args: [gameId],
    });
    return r.rows.map(rowToRsvp);
  }

  async listWithMembers(gameId: string, teamId: string): Promise<MemberRsvp[]> {
    const r = await this.db.execute({
      sql: `SELECT
              m.id AS member_id,
              m.name AS member_name,
              m.role AS member_role,
              COALESCE(rs.response, 'NO_RESPONSE') AS response,
              rs.responded_at AS responded_at
            FROM members m
            LEFT JOIN rsvps rs
              ON rs.member_id = m.id AND rs.game_id = ?
            WHERE m.team_id = ?
            ORDER BY m.created_at ASC`,
      args: [gameId, teamId],
    });
    return r.rows.map(rowToMemberRsvp);
  }

  async breakdown(gameId: string, teamId: string): Promise<RsvpBreakdown> {
    const rows = await this.listWithMembers(gameId, teamId);
    const out: RsvpBreakdown = {
      available: [],
      unavailable: [],
      maybe: [],
      no_response: [],
    };
    for (const row of rows) {
      if (row.response === "AVAILABLE") out.available.push(row);
      else if (row.response === "UNAVAILABLE") out.unavailable.push(row);
      else if (row.response === "MAYBE") out.maybe.push(row);
      else out.no_response.push(row);
    }
    return out;
  }

  async summarize(gameId: string, teamId: string): Promise<RsvpSummary> {
    const r = await this.db.execute({
      sql: `SELECT
              SUM(CASE WHEN r.response = 'AVAILABLE'   THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN r.response = 'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable,
              SUM(CASE WHEN r.response = 'MAYBE'       THEN 1 ELSE 0 END) AS maybe,
              (SELECT COUNT(*) FROM members WHERE team_id = ?) AS total,
              COUNT(r.id) AS recorded
            FROM rsvps r
            WHERE r.game_id = ?`,
      args: [teamId, gameId],
    });
    const row = r.rows[0];
    const available = Number(row?.available ?? 0);
    const unavailable = Number(row?.unavailable ?? 0);
    const maybe = Number(row?.maybe ?? 0);
    const total = Number(row?.total ?? 0);
    const recorded = Number(row?.recorded ?? 0);
    return {
      available,
      unavailable,
      maybe,
      no_response: Math.max(0, total - recorded),
    };
  }
}

class LibsqlAuditRepository implements AuditRepository {
  constructor(private readonly db: DbClient) {}

  async insert(log: AuditLog): Promise<AuditLog> {
    await this.db.execute({
      sql: `INSERT INTO audit_logs (
              id, actor, action, target_type, target_id,
              before_json, after_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        log.id,
        log.actor,
        log.action,
        log.target_type,
        log.target_id,
        log.before_json,
        log.after_json,
        log.created_at,
      ],
    });
    return log;
  }

  async list(targetType: string, targetId: string): Promise<AuditLog[]> {
    const r = await this.db.execute({
      sql: `SELECT * FROM audit_logs
            WHERE target_type = ? AND target_id = ?
            ORDER BY created_at ASC`,
      args: [targetType, targetId],
    });
    return r.rows.map(rowToAuditLog);
  }
}

export function buildRepositories(db: DbClient): Repositories {
  return {
    teams: new LibsqlTeamRepository(db),
    members: new LibsqlMemberRepository(db),
    games: new LibsqlGameRepository(db),
    rsvps: new LibsqlRsvpRepository(db),
    audit: new LibsqlAuditRepository(db),
  };
}
