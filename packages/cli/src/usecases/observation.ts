// 🥉 Bronze 層: エージェントが会話などで得た「生の観測」を追記専用で貯める。
// 構造を決めずにまず書き留め、後で Silver/Gold へ昇格させる素材にする。
import type { Observation, ObservationKind } from "../domain/types";
import type { ObservationFilter, UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { MemberNotFoundError, TeamNotFoundError } from "./errors";

export interface RecordObservationInput {
  teamId: string;
  kind: ObservationKind;
  body: string;
  subject: string | null;
  memberId: string | null;
  source: string | null;
}

export async function recordObservation(
  ctx: UseCaseContext,
  input: RecordObservationInput,
): Promise<Observation> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  if (input.memberId) {
    const member = await ctx.repo.members.get(input.memberId);
    if (!member || member.team_id !== team.id) {
      throw new MemberNotFoundError(input.memberId);
    }
  }
  const now = ctx.now().toISOString();
  const observation: Observation = {
    id: ctx.newId(),
    team_id: team.id,
    member_id: input.memberId,
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    source: input.source,
    observed_at: now,
    created_at: now,
  };
  await ctx.repo.observations.insert(observation);
  await writeAuditLog(ctx, {
    action: "OBSERVATION_RECORDED",
    targetType: "observation",
    targetId: observation.id,
    after: observation,
  });
  return observation;
}

export async function listObservations(
  ctx: UseCaseContext,
  filter: ObservationFilter,
): Promise<Observation[]> {
  return ctx.repo.observations.list(filter);
}
