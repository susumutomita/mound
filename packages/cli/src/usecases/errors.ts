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

export class TransitionDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TransitionDeniedError";
  }
}
