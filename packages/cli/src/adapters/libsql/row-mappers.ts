import type { InValue, Row } from "@libsql/client";
import {
  assertGameStatus,
  assertMemberRole,
  assertRsvpResponse,
} from "../../domain/guards";
import type {
  AuditLog,
  Game,
  GroundSlot,
  Member,
  MemberRsvp,
  Rsvp,
  Team,
} from "../../domain/types";

export const str = (v: InValue): string => String(v);
export const nullable = (v: InValue): string | null =>
  v === null || v === undefined ? null : String(v);

export function rowToTeam(row: Row): Team {
  return {
    id: str(row.id),
    name: str(row.name),
    home_area: nullable(row.home_area),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToMember(row: Row): Member {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    name: str(row.name),
    email: nullable(row.email),
    role: assertMemberRole(str(row.role)),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToGame(row: Row): Game {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    title: str(row.title),
    status: assertGameStatus(str(row.status)),
    game_date: nullable(row.game_date),
    ground_name: nullable(row.ground_name),
    min_players: Number(row.min_players),
    note: nullable(row.note),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToRsvp(row: Row): Rsvp {
  return {
    id: str(row.id),
    game_id: str(row.game_id),
    member_id: str(row.member_id),
    response: assertRsvpResponse(str(row.response)),
    responded_at: str(row.responded_at),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToMemberRsvp(row: Row): MemberRsvp {
  return {
    member_id: str(row.member_id),
    member_name: str(row.member_name),
    member_role: assertMemberRole(str(row.member_role)),
    response: assertRsvpResponse(str(row.response)),
    responded_at: nullable(row.responded_at),
  };
}

export function rowToAuditLog(row: Row): AuditLog {
  return {
    id: str(row.id),
    actor: str(row.actor),
    action: str(row.action),
    target_type: str(row.target_type),
    target_id: str(row.target_id),
    before_json: nullable(row.before_json),
    after_json: nullable(row.after_json),
    created_at: str(row.created_at),
  };
}

export function rowToGroundSlot(row: Row): GroundSlot {
  return {
    id: str(row.id),
    slot_key: str(row.slot_key),
    source: str(row.source),
    facility_name: str(row.facility_name),
    date_iso: nullable(row.date_iso),
    date_raw: str(row.date_raw),
    time_range: nullable(row.time_range),
    status: nullable(row.status),
    raw: str(row.raw),
    scraped_at: str(row.scraped_at),
    first_seen_at: str(row.first_seen_at),
    ingested_at: str(row.ingested_at),
  };
}
