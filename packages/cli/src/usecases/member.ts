import type { Member, MemberRole } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { MemberNotFoundError, TeamNotFoundError } from "./errors";

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

export interface UpdateMemberInput {
  memberId: string;
  // undefined = 変更しない。本名は必須でなく、name は表示名/ニックネームでよい。
  name?: string;
  email?: string;
  role?: MemberRole;
}

export async function updateMember(
  ctx: UseCaseContext,
  input: UpdateMemberInput,
): Promise<Member> {
  const member = await ctx.repo.members.get(input.memberId);
  if (!member) throw new MemberNotFoundError(input.memberId);
  const before = { ...member };
  const updated: Member = {
    ...member,
    name: input.name ?? member.name,
    email: input.email ?? member.email,
    role: input.role ?? member.role,
    updated_at: ctx.now().toISOString(),
  };
  await ctx.repo.members.update(updated);
  await writeAuditLog(ctx, {
    action: "MEMBER_UPDATED",
    targetType: "member",
    targetId: member.id,
    before,
    after: updated,
  });
  return updated;
}

export async function removeMember(
  ctx: UseCaseContext,
  id: string,
): Promise<boolean> {
  const member = await ctx.repo.members.get(id);
  if (!member) return false;
  const removed = await ctx.repo.members.remove(id);
  if (removed) {
    await writeAuditLog(ctx, {
      action: "MEMBER_REMOVED",
      targetType: "member",
      targetId: id,
      before: member,
    });
  }
  return removed;
}
