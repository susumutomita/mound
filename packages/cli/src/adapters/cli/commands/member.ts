import { z } from "zod";
import { MEMBER_ROLES } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import { addMember, listMembers } from "../../../usecases/member";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const addInput = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1, "name は必須です").max(80),
  email: z.string().email().optional(),
  role: z.enum(MEMBER_ROLES).default("MEMBER"),
});

export async function runMember(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound member <add|list>");
  if (sub === "add") return add(args, ctx, opts);
  if (sub === "list") return list(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: member ${sub}`);
}

async function add(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(addInput, {
    teamId: requireFlag(args.flags, "team"),
    name: requireFlag(args.flags, "name"),
    email: optionalFlag(args.flags, "email"),
    role: optionalFlag(args.flags, "role") ?? "MEMBER",
  });
  const member = await addMember(ctx, {
    teamId: data.teamId,
    name: data.name,
    email: data.email ?? null,
    role: data.role,
  });
  emit(member, `メンバーを追加しました: ${member.id} (${member.name})`, opts);
}

async function list(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const members = await listMembers(ctx, teamId);
  emit(members, formatRows(members, ["id", "name", "role", "email"]), opts);
}
