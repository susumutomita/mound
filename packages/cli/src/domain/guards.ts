import {
  GAME_STATUSES,
  type GameStatus,
  MEMBER_ROLES,
  type MemberRole,
  NOTIFICATION_KINDS,
  type NotificationKind,
  RSVP_RESPONSES,
  type RsvpResponse,
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
