import type {
  MemberRsvp,
  Rsvp,
  RsvpResponse,
  RsvpSummary,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import {
  CrossTeamRsvpError,
  GameNotFoundError,
  MemberNotFoundError,
} from "./errors";

export interface SetRsvpInput {
  gameId: string;
  memberId: string;
  response: RsvpResponse;
}

export async function setRsvp(
  ctx: UseCaseContext,
  input: SetRsvpInput,
): Promise<Rsvp> {
  const game = await ctx.repo.games.get(input.gameId);
  if (!game) throw new GameNotFoundError(input.gameId);
  const member = await ctx.repo.members.get(input.memberId);
  if (!member) throw new MemberNotFoundError(input.memberId);
  if (member.team_id !== game.team_id) throw new CrossTeamRsvpError();
  const now = ctx.now().toISOString();
  const rsvp: Rsvp = {
    id: ctx.newId(),
    game_id: game.id,
    member_id: member.id,
    response: input.response,
    responded_at: now,
    created_at: now,
    updated_at: now,
  };
  const saved = await ctx.repo.rsvps.upsert(rsvp);
  await writeAuditLog(ctx, {
    action: `RSVP_${input.response}`,
    targetType: "game",
    targetId: game.id,
    after: saved,
  });
  return saved;
}

export async function listRsvpsWithMembers(
  ctx: UseCaseContext,
  gameId: string,
): Promise<MemberRsvp[]> {
  const game = await ctx.repo.games.get(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  return ctx.repo.rsvps.listWithMembers(gameId, game.team_id);
}

export async function summarizeRsvps(
  ctx: UseCaseContext,
  gameId: string,
  teamIdOverride?: string,
): Promise<RsvpSummary> {
  const game = await ctx.repo.games.get(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  return ctx.repo.rsvps.summarize(gameId, teamIdOverride ?? game.team_id);
}
