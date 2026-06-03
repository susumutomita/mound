import { z } from "zod";
import { MEMBER_ROLES } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  addMember,
  listMembers,
  removeMember,
  updateMember,
} from "../../../usecases/member";
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
  // name は表示名/ハンドル。本名でなくニックネーム単体で構わない。
  name: z.string().min(1, "name は必須です").max(80),
  email: z.string().email().optional(),
  role: z.enum(MEMBER_ROLES).default("MEMBER"),
});

const updateInput = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  role: z.enum(MEMBER_ROLES).optional(),
});

export async function runMember(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub)
    throw new UsageError("使い方: mound member <add|list|update|remove>");
  if (sub === "add") return add(args, ctx, opts);
  if (sub === "list") return list(args, ctx, opts);
  if (sub === "update") return update(args, ctx, opts);
  if (sub === "remove") return remove(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: member ${sub}`);
}

async function update(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const memberId = requireFlag(args.flags, "member");
  const data = parseOrUsage(updateInput, {
    name: optionalFlag(args.flags, "name"),
    email: optionalFlag(args.flags, "email"),
    role: optionalFlag(args.flags, "role"),
  });
  if (
    data.name === undefined &&
    data.email === undefined &&
    data.role === undefined
  ) {
    throw new UsageError(
      "--name / --email / --role のいずれかを指定してください",
    );
  }
  const member = await updateMember(ctx, {
    memberId,
    name: data.name,
    email: data.email,
    role: data.role,
  });
  emit(member, `メンバーを更新しました: ${member.id} (${member.name})`, opts);
}

async function remove(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1] ?? optionalFlag(args.flags, "member");
  if (!id) throw new UsageError("使い方: mound member remove <ID>");
  const removed = await removeMember(ctx, id);
  emit(
    { ok: removed, id },
    removed
      ? `メンバーを削除しました: ${id}`
      : `該当するメンバーが見つかりません: ${id}`,
    opts,
  );
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
