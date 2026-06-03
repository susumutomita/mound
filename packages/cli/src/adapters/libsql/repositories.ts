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
  Observation,
  Rsvp,
  RsvpBreakdown,
  RsvpSummary,
  Settlement,
  SettlementShare,
  SettlementStatus,
  Team,
  TeamKnowledge,
} from "../../domain/types";
import type {
  AuditRepository,
  BackupRepository,
  BackupRow,
  GameRepository,
  GroundSlotDiffFilter,
  GroundSlotFilter,
  GroundSlotPruneFilter,
  GroundSlotRepository,
  GroundWatchRepository,
  KnowledgeFilter,
  MemberRepository,
  NotificationChannelRepository,
  ObservationFilter,
  ObservationRepository,
  Repositories,
  RsvpRepository,
  SettlementRepository,
  TeamKnowledgeRepository,
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
  rowToObservation,
  rowToRsvp,
  rowToSettlement,
  rowToSettlementShare,
  rowToTeam,
  rowToTeamKnowledge,
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

  async update(team: Team): Promise<Team> {
    await this.db.execute({
      sql: "UPDATE teams SET name = ?, home_area = ?, updated_at = ? WHERE id = ?",
      args: [team.name, team.home_area, team.updated_at, team.id],
    });
    return team;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "DELETE FROM teams WHERE id = ?",
      args: [id],
    });
    return r.rowsAffected > 0;
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

  async update(member: Member): Promise<Member> {
    await this.db.execute({
      sql: "UPDATE members SET name = ?, email = ?, role = ?, updated_at = ? WHERE id = ?",
      args: [
        member.name,
        member.email,
        member.role,
        member.updated_at,
        member.id,
      ],
    });
    return member;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "DELETE FROM members WHERE id = ?",
      args: [id],
    });
    return r.rowsAffected > 0;
  }
}

class LibsqlGameRepository implements GameRepository {
  constructor(private readonly db: DbClient) {}

  async insert(game: Game): Promise<Game> {
    await this.db.execute({
      sql: `INSERT INTO games (
              id, team_id, title, status, game_date, ground_name, ground_status,
              min_players, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        game.id,
        game.team_id,
        game.title,
        game.status,
        game.game_date,
        game.ground_name,
        game.ground_status,
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

  async update(game: Game): Promise<Game> {
    await this.db.execute({
      sql: `UPDATE games SET title = ?, game_date = ?, ground_name = ?,
              ground_status = ?, min_players = ?, note = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        game.title,
        game.game_date,
        game.ground_name,
        game.ground_status,
        game.min_players,
        game.note,
        game.updated_at,
        game.id,
      ],
    });
    return game;
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
    if (filter.sinceDate) {
      // date_iso が null の枠は日付フィルタ時は除外する。
      where.push("date_iso IS NOT NULL AND date_iso >= ?");
      args.push(filter.sinceDate);
    }
    if (filter.ingestedSince) {
      where.push("ingested_at >= ?");
      args.push(filter.ingestedSince);
    }
    const sql = `SELECT * FROM ground_slots${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY date_iso ASC, time_range ASC, facility_name ASC`;
    const r = await this.db.execute({ sql, args });
    return r.rows.map(rowToGroundSlot);
  }

  async prune(filter: GroundSlotPruneFilter): Promise<number> {
    // 過去日 OR 古い取得 OR テストデータ (動作確認) を削除する。
    const or: string[] = ["facility_name LIKE '%動作確認%'"];
    const args: InValue[] = [];
    if (filter.beforeDate) {
      or.push("(date_iso IS NOT NULL AND date_iso < ?)");
      args.push(filter.beforeDate);
    }
    if (filter.ingestedBefore) {
      or.push("ingested_at < ?");
      args.push(filter.ingestedBefore);
    }
    const r = await this.db.execute({
      sql: `DELETE FROM ground_slots WHERE ${or.join(" OR ")}`,
      args,
    });
    return r.rowsAffected;
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

class LibsqlObservationRepository implements ObservationRepository {
  constructor(private readonly db: DbClient) {}

  async insert(observation: Observation): Promise<Observation> {
    await this.db.execute({
      sql: `INSERT INTO observations (
              id, team_id, member_id, kind, subject, body, source,
              observed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        observation.id,
        observation.team_id,
        observation.member_id,
        observation.kind,
        observation.subject,
        observation.body,
        observation.source,
        observation.observed_at,
        observation.created_at,
      ],
    });
    return observation;
  }

  async list(filter: ObservationFilter): Promise<Observation[]> {
    const where: string[] = ["team_id = ?"];
    const args: InValue[] = [filter.teamId];
    if (filter.kind) {
      where.push("kind = ?");
      args.push(filter.kind);
    }
    if (filter.memberId) {
      where.push("member_id = ?");
      args.push(filter.memberId);
    }
    const r = await this.db.execute({
      sql: `SELECT * FROM observations WHERE ${where.join(" AND ")}
            ORDER BY observed_at DESC`,
      args,
    });
    return r.rows.map(rowToObservation);
  }
}

class LibsqlTeamKnowledgeRepository implements TeamKnowledgeRepository {
  constructor(private readonly db: DbClient) {}

  async insert(entry: TeamKnowledge): Promise<TeamKnowledge> {
    await this.db.execute({
      sql: `INSERT INTO team_knowledge (
              id, team_id, member_id, category, key, value, origin,
              confidence, evidence_count, source, last_observed_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entry.id,
        entry.team_id,
        entry.member_id,
        entry.category,
        entry.key,
        entry.value,
        entry.origin,
        entry.confidence,
        entry.evidence_count,
        entry.source,
        entry.last_observed_at,
        entry.created_at,
        entry.updated_at,
      ],
    });
    return entry;
  }

  async update(entry: TeamKnowledge): Promise<TeamKnowledge> {
    await this.db.execute({
      sql: `UPDATE team_knowledge SET
              category = ?, value = ?, origin = ?, confidence = ?,
              evidence_count = ?, source = ?, last_observed_at = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        entry.category,
        entry.value,
        entry.origin,
        entry.confidence,
        entry.evidence_count,
        entry.source,
        entry.last_observed_at,
        entry.updated_at,
        entry.id,
      ],
    });
    return entry;
  }

  async getByKey(
    teamId: string,
    memberId: string | null,
    key: string,
  ): Promise<TeamKnowledge | null> {
    // member_id は NULL を含むため = ではなく IS NULL で分岐する。
    const memberClause =
      memberId === null ? "member_id IS NULL" : "member_id = ?";
    const args: InValue[] =
      memberId === null ? [teamId, key] : [teamId, memberId, key];
    const r = await this.db.execute({
      sql: `SELECT * FROM team_knowledge
            WHERE team_id = ? AND ${memberClause} AND key = ?`,
      args,
    });
    return r.rows[0] ? rowToTeamKnowledge(r.rows[0]) : null;
  }

  async list(filter: KnowledgeFilter): Promise<TeamKnowledge[]> {
    const where: string[] = ["team_id = ?"];
    const args: InValue[] = [filter.teamId];
    if (filter.category) {
      where.push("category = ?");
      args.push(filter.category);
    }
    if (filter.memberId) {
      where.push("member_id = ?");
      args.push(filter.memberId);
    }
    if (filter.key) {
      where.push("key = ?");
      args.push(filter.key);
    }
    const r = await this.db.execute({
      sql: `SELECT * FROM team_knowledge WHERE ${where.join(" AND ")}
            ORDER BY category ASC, key ASC, created_at ASC`,
      args,
    });
    return r.rows.map(rowToTeamKnowledge);
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: "DELETE FROM team_knowledge WHERE id = ?",
      args: [id],
    });
    return r.rowsAffected > 0;
  }
}

class LibsqlSettlementRepository implements SettlementRepository {
  constructor(private readonly db: DbClient) {}

  async insert(settlement: Settlement): Promise<Settlement> {
    await this.db.execute({
      sql: `INSERT INTO settlements (
              id, game_id, team_id, total_amount, payment_link, payment_label,
              note, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        settlement.id,
        settlement.game_id,
        settlement.team_id,
        settlement.total_amount,
        settlement.payment_link,
        settlement.payment_label,
        settlement.note,
        settlement.status,
        settlement.created_at,
        settlement.updated_at,
      ],
    });
    return settlement;
  }

  async getByGame(gameId: string): Promise<Settlement | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM settlements WHERE game_id = ?",
      args: [gameId],
    });
    return r.rows[0] ? rowToSettlement(r.rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: SettlementStatus,
    updatedAt: string,
  ): Promise<void> {
    await this.db.execute({
      sql: "UPDATE settlements SET status = ?, updated_at = ? WHERE id = ?",
      args: [status, updatedAt, id],
    });
  }

  async insertShare(share: SettlementShare): Promise<SettlementShare> {
    await this.db.execute({
      sql: `INSERT INTO settlement_shares (
              id, settlement_id, member_id, amount, paid, paid_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        share.id,
        share.settlement_id,
        share.member_id,
        share.amount,
        share.paid ? 1 : 0,
        share.paid_at,
        share.created_at,
        share.updated_at,
      ],
    });
    return share;
  }

  async listShares(settlementId: string): Promise<SettlementShare[]> {
    const r = await this.db.execute({
      sql: `SELECT * FROM settlement_shares WHERE settlement_id = ?
            ORDER BY created_at ASC`,
      args: [settlementId],
    });
    return r.rows.map(rowToSettlementShare);
  }

  async getShare(
    settlementId: string,
    memberId: string,
  ): Promise<SettlementShare | null> {
    const r = await this.db.execute({
      sql: "SELECT * FROM settlement_shares WHERE settlement_id = ? AND member_id = ?",
      args: [settlementId, memberId],
    });
    return r.rows[0] ? rowToSettlementShare(r.rows[0]) : null;
  }

  async updateSharePaid(
    id: string,
    paid: boolean,
    paidAt: string | null,
    updatedAt: string,
  ): Promise<void> {
    await this.db.execute({
      sql: "UPDATE settlement_shares SET paid = ?, paid_at = ?, updated_at = ? WHERE id = ?",
      args: [paid ? 1 : 0, paidAt, updatedAt, id],
    });
  }
}

// バックアップ対象テーブル。FK 順 (取り込み時に親→子の順で復元できる)。
const BACKUP_TABLES = [
  "teams",
  "members",
  "games",
  "rsvps",
  "ground_slots",
  "notification_channels",
  "ground_watches",
  "observations",
  "team_knowledge",
  "settlements",
  "settlement_shares",
  "audit_logs",
] as const;
// 列名は schema 由来のみ許可 (取り込みファイル経由の SQL インジェクション防止)。
const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/;

class LibsqlBackupRepository implements BackupRepository {
  constructor(private readonly db: DbClient) {}

  async exportAll(): Promise<BackupRow[]> {
    const out: BackupRow[] = [];
    for (const table of BACKUP_TABLES) {
      const r = await this.db.execute(`SELECT * FROM ${table}`);
      for (const row of r.rows) {
        const data: Record<string, unknown> = {};
        for (const col of r.columns) {
          data[col] = (row as unknown as Record<string, unknown>)[col];
        }
        out.push({ table, data });
      }
    }
    return out;
  }

  async importAll(rows: BackupRow[]): Promise<number> {
    const allowed = new Set<string>(BACKUP_TABLES);
    let n = 0;
    for (const { table, data } of rows) {
      if (!allowed.has(table)) continue;
      const cols = Object.keys(data).filter((c) => SAFE_COLUMN.test(c));
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => "?").join(", ");
      await this.db.execute({
        sql: `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
        args: cols.map((c) => data[c] as InValue),
      });
      n++;
    }
    return n;
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
    observations: new LibsqlObservationRepository(db),
    knowledge: new LibsqlTeamKnowledgeRepository(db),
    settlements: new LibsqlSettlementRepository(db),
    backup: new LibsqlBackupRepository(db),
  };
}
