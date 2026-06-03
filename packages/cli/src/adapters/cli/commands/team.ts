import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import {
  createTeam,
  listTeams,
  removeTeam,
  showTeam,
  updateTeam,
} from "../../../usecases/team";
import {
  type ParsedArgs,
  UsageError,
  boolFlag,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const createInput = z.object({
  name: z.string().min(1, "name は必須です").max(80),
  area: z.string().max(80).optional(),
});

const updateInput = z.object({
  name: z.string().min(1).max(80).optional(),
  area: z.string().max(80).optional(),
});

export async function runTeam(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) {
    throw new UsageError("使い方: mound team <create|list|show|update|remove>");
  }
  if (sub === "create") return create(args, ctx, opts);
  if (sub === "list") return list(ctx, opts);
  if (sub === "show") return show(args, ctx, opts);
  if (sub === "update") return update(args, ctx, opts);
  if (sub === "remove") return remove(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: team ${sub}`);
}

async function show(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1] ?? requireFlag(args.flags, "team");
  const profile = await showTeam(ctx, id);
  emit(
    profile,
    [
      `${profile.team.name} (${profile.team.home_area ?? "本拠地未設定"}) — ${profile.team.id}`,
      `メンバー ${profile.members.length}人 / 決め事 ${profile.knowledge.length}件`,
      formatRows(profile.members, ["id", "name", "role"]),
    ].join("\n"),
    opts,
  );
}

async function remove(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const id = args.positional[1] ?? optionalFlag(args.flags, "team");
  if (!id) throw new UsageError("使い方: mound team remove <ID>");
  const removed = await removeTeam(ctx, id);
  emit(
    { ok: removed, id },
    removed
      ? `チームを削除しました: ${id} (メンバー・試合・決め事も削除)`
      : `該当するチームが見つかりません: ${id}`,
    opts,
  );
}

async function update(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const data = parseOrUsage(updateInput, {
    name: optionalFlag(args.flags, "name"),
    area: optionalFlag(args.flags, "area"),
  });
  if (data.name === undefined && data.area === undefined) {
    throw new UsageError("--name か --area のどちらかを指定してください");
  }
  const team = await updateTeam(ctx, {
    teamId,
    name: data.name,
    homeArea: data.area,
  });
  emit(team, `チームを更新しました: ${team.id} (${team.name})`, opts);
}

async function create(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(createInput, {
    name: requireFlag(args.flags, "name"),
    area: optionalFlag(args.flags, "area"),
  });
  const team = await createTeam(ctx, {
    name: data.name,
    homeArea: data.area ?? null,
  });
  emit(team, `チームを作成しました: ${team.id} (${team.name})`, opts);
  if (boolFlag(args.flags, "verbose") && !opts.json) {
    opts.sink.write(`home_area: ${team.home_area ?? "(未設定)"}`);
  }
}

async function list(ctx: UseCaseContext, opts: RenderOptions): Promise<void> {
  const teams = await listTeams(ctx);
  emit(
    teams,
    formatRows(teams, ["id", "name", "home_area", "created_at"]),
    opts,
  );
}
