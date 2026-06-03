import {
  GAME_STATUSES,
  type GameStatus,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_ORIGINS,
  type KnowledgeCategory,
  type KnowledgeOrigin,
  MEMBER_ROLES,
  type MemberRole,
  NOTIFICATION_KINDS,
  type NotificationKind,
  OBSERVATION_KINDS,
  type ObservationKind,
  RSVP_RESPONSES,
  type RsvpResponse,
  SETTLEMENT_STATUSES,
  type SettlementStatus,
} from "./types";

export function isGameStatus(value: unknown): value is GameStatus {
  return (
    typeof value === "string" &&
    (GAME_STATUSES as readonly string[]).includes(value)
  );
}

export function isRsvpResponse(value: unknown): value is RsvpResponse {
  return (
    typeof value === "string" &&
    (RSVP_RESPONSES as readonly string[]).includes(value)
  );
}

export function isMemberRole(value: unknown): value is MemberRole {
  return (
    typeof value === "string" &&
    (MEMBER_ROLES as readonly string[]).includes(value)
  );
}

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

export function assertGameStatus(value: unknown): GameStatus {
  if (!isGameStatus(value)) {
    throw new DomainInvariantError(`不正な GameStatus: ${String(value)}`);
  }
  return value;
}

export function assertRsvpResponse(value: unknown): RsvpResponse {
  if (!isRsvpResponse(value)) {
    throw new DomainInvariantError(`不正な RsvpResponse: ${String(value)}`);
  }
  return value;
}

export function assertMemberRole(value: unknown): MemberRole {
  if (!isMemberRole(value)) {
    throw new DomainInvariantError(`不正な MemberRole: ${String(value)}`);
  }
  return value;
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return (
    typeof value === "string" &&
    (NOTIFICATION_KINDS as readonly string[]).includes(value)
  );
}

export function assertNotificationKind(value: unknown): NotificationKind {
  if (!isNotificationKind(value)) {
    throw new DomainInvariantError(`不正な NotificationKind: ${String(value)}`);
  }
  return value;
}

export function isObservationKind(value: unknown): value is ObservationKind {
  return (
    typeof value === "string" &&
    (OBSERVATION_KINDS as readonly string[]).includes(value)
  );
}

export function assertObservationKind(value: unknown): ObservationKind {
  if (!isObservationKind(value)) {
    throw new DomainInvariantError(`不正な ObservationKind: ${String(value)}`);
  }
  return value;
}

export function isKnowledgeCategory(
  value: unknown,
): value is KnowledgeCategory {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function assertKnowledgeCategory(value: unknown): KnowledgeCategory {
  if (!isKnowledgeCategory(value)) {
    throw new DomainInvariantError(
      `不正な KnowledgeCategory: ${String(value)}`,
    );
  }
  return value;
}

export function isKnowledgeOrigin(value: unknown): value is KnowledgeOrigin {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_ORIGINS as readonly string[]).includes(value)
  );
}

export function assertKnowledgeOrigin(value: unknown): KnowledgeOrigin {
  if (!isKnowledgeOrigin(value)) {
    throw new DomainInvariantError(`不正な KnowledgeOrigin: ${String(value)}`);
  }
  return value;
}

export function isSettlementStatus(value: unknown): value is SettlementStatus {
  return (
    typeof value === "string" &&
    (SETTLEMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function assertSettlementStatus(value: unknown): SettlementStatus {
  if (!isSettlementStatus(value)) {
    throw new DomainInvariantError(`不正な SettlementStatus: ${String(value)}`);
  }
  return value;
}
