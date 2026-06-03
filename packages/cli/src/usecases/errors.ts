import type { GameStatus, RsvpSummary } from "../domain/types";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} が存在しません: ${id}`);
    this.name = "NotFoundError";
  }
}

export class TeamNotFoundError extends NotFoundError {
  constructor(id: string) {
    super("team", id);
    this.name = "TeamNotFoundError";
  }
}

export class GameNotFoundError extends NotFoundError {
  constructor(id: string) {
    super("game", id);
    this.name = "GameNotFoundError";
  }
}

export class MemberNotFoundError extends NotFoundError {
  constructor(id: string) {
    super("member", id);
    this.name = "MemberNotFoundError";
  }
}

export class CrossTeamRsvpError extends Error {
  constructor() {
    super("member の所属チームが game と一致しません");
    this.name = "CrossTeamRsvpError";
  }
}

// 精算ドメインの拒否 (参加者ゼロ / 精算未作成 / 二重作成 等)。CLI では exit 2。
export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

// 入力が不足/不正でドメイン的に進められないとき。CLI では exit 2。
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export interface TransitionDeniedDetails {
  from: GameStatus;
  to: GameStatus;
  available_transitions: GameStatus[];
  reason: string;
  rsvp_summary?: RsvpSummary;
  min_players?: number;
}

export class TransitionDeniedError extends Error {
  readonly from: GameStatus;
  readonly to: GameStatus;
  readonly available_transitions: GameStatus[];
  readonly rsvp_summary?: RsvpSummary;
  readonly min_players?: number;

  constructor(details: TransitionDeniedDetails) {
    super(details.reason);
    this.name = "TransitionDeniedError";
    this.from = details.from;
    this.to = details.to;
    this.available_transitions = details.available_transitions;
    this.rsvp_summary = details.rsvp_summary;
    this.min_players = details.min_players;
  }

  // CLI 層が --json で展開できるよう構造化フィールドを返す。
  toDetails(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      from: this.from,
      to: this.to,
      available_transitions: this.available_transitions,
    };
    if (this.rsvp_summary) out.rsvp_summary = this.rsvp_summary;
    if (this.min_players !== undefined) out.min_players = this.min_players;
    return out;
  }
}
