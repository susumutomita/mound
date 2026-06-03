import type { InValue, Row } from "@libsql/client";
import {
  assertGameStatus,
  assertKnowledgeCategory,
  assertKnowledgeOrigin,
  assertMemberRole,
  assertNotificationKind,
  assertObservationKind,
  assertRsvpResponse,
  assertSettlementStatus,
} from "../../domain/guards";
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
  Settlement,
  SettlementShare,
  Team,
  TeamKnowledge,
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

export function rowToNotificationChannel(row: Row): NotificationChannel {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    kind: assertNotificationKind(str(row.kind)),
    webhook_url: str(row.webhook_url),
    secret: nullable(row.secret),
    target: nullable(row.target),
    label: nullable(row.label),
    enabled: Number(row.enabled) !== 0,
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToGroundWatch(row: Row): GroundWatch {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    label: nullable(row.label),
    source: nullable(row.source),
    facility_pattern: nullable(row.facility_pattern),
    weekdays: nullable(row.weekdays),
    time_from: nullable(row.time_from),
    time_to: nullable(row.time_to),
    enabled: Number(row.enabled) !== 0,
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToObservation(row: Row): Observation {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    member_id: nullable(row.member_id),
    kind: assertObservationKind(str(row.kind)),
    subject: nullable(row.subject),
    body: str(row.body),
    source: nullable(row.source),
    observed_at: str(row.observed_at),
    created_at: str(row.created_at),
  };
}

export function rowToTeamKnowledge(row: Row): TeamKnowledge {
  return {
    id: str(row.id),
    team_id: str(row.team_id),
    member_id: nullable(row.member_id),
    category: assertKnowledgeCategory(str(row.category)),
    key: str(row.key),
    value: str(row.value),
    origin: assertKnowledgeOrigin(str(row.origin)),
    confidence: Number(row.confidence),
    evidence_count: Number(row.evidence_count),
    source: nullable(row.source),
    last_observed_at: nullable(row.last_observed_at),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToSettlement(row: Row): Settlement {
  return {
    id: str(row.id),
    game_id: str(row.game_id),
    team_id: str(row.team_id),
    total_amount: Number(row.total_amount),
    payment_link: nullable(row.payment_link),
    payment_label: nullable(row.payment_label),
    note: nullable(row.note),
    status: assertSettlementStatus(str(row.status)),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export function rowToSettlementShare(row: Row): SettlementShare {
  return {
    id: str(row.id),
    settlement_id: str(row.settlement_id),
    member_id: str(row.member_id),
    amount: Number(row.amount),
    paid: Number(row.paid) !== 0,
    paid_at: nullable(row.paid_at),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
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
