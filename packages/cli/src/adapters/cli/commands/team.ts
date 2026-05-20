import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { createTeam, listTeams } from "../../../usecases/team";
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

export async function runTeam(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound team <create|list>");
  if (sub === "create") return create(args, ctx, opts);
  if (sub === "list") return list(ctx, opts);
  throw new UsageError(`未知のサブコマンド: team ${sub}`);
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
