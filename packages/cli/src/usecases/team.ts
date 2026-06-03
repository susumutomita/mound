import type { Team } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { TeamNotFoundError } from "./errors";

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

export interface UpdateTeamInput {
  teamId: string;
  // undefined = 変更しない。string = その値に更新。
  name?: string;
  homeArea?: string;
}

export async function updateTeam(
  ctx: UseCaseContext,
  input: UpdateTeamInput,
): Promise<Team> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const before = { ...team };
  const updated: Team = {
    ...team,
    name: input.name ?? team.name,
    home_area: input.homeArea ?? team.home_area,
    updated_at: ctx.now().toISOString(),
  };
  await ctx.repo.teams.update(updated);
  await writeAuditLog(ctx, {
    action: "TEAM_UPDATED",
    targetType: "team",
    targetId: team.id,
    before,
    after: updated,
  });
  return updated;
}
