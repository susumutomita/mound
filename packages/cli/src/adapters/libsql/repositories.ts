import type { InValue } from "@libsql/client";
import type {
  AuditLog,
  Game,
  GameStatus,
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
  GroundSlotDiffFilter,
  GroundSlotFilter,
  GroundSlotRepository,
  GroundWatchRepository,
  MemberRepository,
  NotificationChannelRepository,
  Repositories,
  RsvpRepository,
  TeamRepository,
} from "../../ports";
import type { DbClient } from "./client";
import {
  rowToAuditLog,
  rowToGame,
  rowToGroundSlot,
  rowToGroundWatch,
  rowToMember,
  rowToMemberRsvp,
  rowToNotificationChannel,
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

class LibsqlGroundSlotRepository implements GroundSlotRepository {
  constructor(private readonly db: DbClient) {}

  async upsert(slot: GroundSlot): Promise<GroundSlot> {
    // first_seen_at は新規挿入時にのみ書き込み、既存行は維持する。
    await this.db.execute({
      sql: `INSERT INTO ground_slots (
              id, slot_key, source, facility_name, date_iso, date_raw,
              time_range, status, raw, scraped_at, first_seen_at, ingested_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slot_key) DO UPDATE SET
              source = excluded.source,
              facility_name = excluded.facility_name,
              date_iso = excluded.date_iso,
              date_raw = excluded.date_raw,
              time_range = excluded.time_range,
              status = excluded.status,
              raw = excluded.raw,
              scraped_at = excluded.scraped_at,
              ingested_at = excluded.ingested_at`,
      args: [
        slot.id,
        slot.slot_key,
        slot.source,
        slot.facility_name,
        slot.date_iso,
        slot.date_raw,
        slot.time_range,
        slot.status,
        slot.raw,
        slot.scraped_at,
        slot.first_seen_at,
        slot.ingested_at,
      ],
    });
    const r = await this.db.execute({
      sql: "SELECT * FROM ground_slots WHERE slot_key = ?",
      args: [slot.slot_key],
    });
    if (!r.rows[0]) throw new Error("ground_slot upsert failed");
    return rowToGroundSlot(r.rows[0]);
  }

  async list(filter: GroundSlotFilter): Promise<GroundSlot[]> {
    const where: string[] = [];
    const args: InValue[] = [];
    if (filter.source) {
      where.push("source = ?");
      args.push(filter.source);
    }
    if (filter.dateIso) {
      where.push("date_iso = ?");
      args.push(filter.dateIso);
    }
    const sql = `SELECT * FROM ground_slots${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY date_iso ASC, time_range ASC, facility_name ASC`;
    const r = await this.db.execute({ sql, args });
    return r.rows.map(rowToGroundSlot);
  }

  async getByKey(slotKey: string): Promise<GroundSlot | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM ground_slots WHERE slot_key = ?",
      args: [slotKey],
    });
    return r.rows[0] ? rowToGroundSlot(r.rows[0]) : null;
  }

  async listNewerThan(filter: GroundSlotDiffFilter): Promise<GroundSlot[]> {
    const where: string[] = ["first_seen_at >= ?"];
    const args: InValue[] = [filter.since];
    if (filter.source) {
      where.push("source = ?");
      args.push(filter.source);
    }
    if (filter.dateIso) {
      where.push("date_iso = ?");
      args.push(filter.dateIso);
    }
    const r = await this.db.execute({
      sql: `SELECT * FROM ground_slots WHERE ${where.join(" AND ")}
            ORDER BY first_seen_at DESC, date_iso ASC, time_range ASC`,
      args,
    });
    return r.rows.map(rowToGroundSlot);
  }
}

class LibsqlNotificationChannelRepository
  implements NotificationChannelRepository
{
  constructor(private readonly db: DbClient) {}

  async insert(channel: NotificationChannel): Promise<NotificationChannel> {
    await this.db.execute({
      sql: `INSERT INTO notification_channels (
              id, team_id, kind, webhook_url, secret, target, label,
              enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        channel.id,
        channel.team_id,
        channel.kind,
        channel.webhook_url,
        channel.secret,
        channel.target,
        channel.label,
        channel.enabled ? 1 : 0,
        channel.created_at,
        channel.updated_at,
      ],
    });
    return channel;
  }

  async list(teamId: string): Promise<NotificationChannel[]> {
    const r = await this.db.execute({
      sql: "SELECT * FROM notification_channels WHERE team_id = ? ORDER BY created_at ASC",
      args: [teamId],
    });
    return r.rows.map(rowToNotificationChannel);
  }

  async listEnabled(teamId: string): Promise<NotificationChannel[]> {
    const r = await this.db.execute({
      sql: `SELECT * FROM notification_channels
            WHERE team_id = ? AND enabled <> 0
            ORDER BY created_at ASC`,
      args: [teamId],
    });
    return r.rows.map(rowToNotificationChannel);
  }

  async get(id: string): Promise<NotificationChannel | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM notification_channels WHERE id = ?",
      args: [id],
    });
    return r.rows[0] ? rowToNotificationChannel(r.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "DELETE FROM notification_channels WHERE id = ?",
      args: [id],
    });
    return r.rowsAffected > 0;
  }
}

class LibsqlGroundWatchRepository implements GroundWatchRepository {
  constructor(private readonly db: DbClient) {}

  async insert(watch: GroundWatch): Promise<GroundWatch> {
    await this.db.execute({
      sql: `INSERT INTO ground_watches (
              id, team_id, label, source, facility_pattern, weekdays,
              time_from, time_to, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        watch.id,
        watch.team_id,
        watch.label,
        watch.source,
        watch.facility_pattern,
        watch.weekdays,
        watch.time_from,
        watch.time_to,
        watch.enabled ? 1 : 0,
        watch.created_at,
        watch.updated_at,
      ],
    });
    return watch;
  }

  async list(teamId: string): Promise<GroundWatch[]> {
    const r = await this.db.execute({
      sql: "SELECT * FROM ground_watches WHERE team_id = ? ORDER BY created_at ASC",
      args: [teamId],
    });
    return r.rows.map(rowToGroundWatch);
  }

  async listEnabled(teamId: string): Promise<GroundWatch[]> {
    const r = await this.db.execute({
      sql: `SELECT * FROM ground_watches WHERE team_id = ? AND enabled <> 0
            ORDER BY created_at ASC`,
      args: [teamId],
    });
    return r.rows.map(rowToGroundWatch);
  }

  async get(id: string): Promise<GroundWatch | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM ground_watches WHERE id = ?",
      args: [id],
    });
    return r.rows[0] ? rowToGroundWatch(r.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "DELETE FROM ground_watches WHERE id = ?",
      args: [id],
    });
    return r.rowsAffected > 0;
  }
}

export function buildRepositories(db: DbClient): Repositories {
  return {
    teams: new LibsqlTeamRepository(db),
    members: new LibsqlMemberRepository(db),
    games: new LibsqlGameRepository(db),
    rsvps: new LibsqlRsvpRepository(db),
    audit: new LibsqlAuditRepository(db),
    groundSlots: new LibsqlGroundSlotRepository(db),
    notifications: new LibsqlNotificationChannelRepository(db),
    groundWatches: new LibsqlGroundWatchRepository(db),
  };
}
