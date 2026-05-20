import type { Team } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";

export interface CreateTeamInput {
  name: string;
  homeArea: string | null;
}

export async function createTeam(
  ctx: UseCaseContext,
  input: CreateTeamInput,
): Promise<Team> {
  const now = ctx.now().toISOString();
  const team: Team = {
    id: ctx.newId(),
    name: input.name,
    home_area: input.homeArea,
    created_at: now,
    updated_at: now,
  };
  await ctx.repo.teams.insert(team);
  await writeAuditLog(ctx, {
    action: "TEAM_CREATED",
    targetType: "team",
    targetId: team.id,
    after: team,
  });
  return team;
}

export async function listTeams(ctx: UseCaseContext): Promise<Team[]> {
  return ctx.repo.teams.list();
}
