import type { Member, MemberRole } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { TeamNotFoundError } from "./errors";

export interface AddMemberInput {
  teamId: string;
  name: string;
  email: string | null;
  role: MemberRole;
}

export async function addMember(
  ctx: UseCaseContext,
  input: AddMemberInput,
): Promise<Member> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const now = ctx.now().toISOString();
  const member: Member = {
    id: ctx.newId(),
    team_id: team.id,
    name: input.name,
    email: input.email,
    role: input.role,
    created_at: now,
    updated_at: now,
  };
  await ctx.repo.members.insert(member);
  await writeAuditLog(ctx, {
    action: "MEMBER_ADDED",
    targetType: "member",
    targetId: member.id,
    after: member,
  });
  return member;
}

export async function listMembers(
  ctx: UseCaseContext,
  teamId: string,
): Promise<Member[]> {
  return ctx.repo.members.list(teamId);
}
