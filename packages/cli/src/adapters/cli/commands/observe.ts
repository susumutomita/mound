import { z } from "zod";
import { OBSERVATION_KINDS } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  listObservations,
  recordObservation,
} from "../../../usecases/observation";
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
  kind: z.enum(OBSERVATION_KINDS),
  body: z.string().min(1, "--body は必須です"),
  subject: z.string().max(120).optional(),
  memberId: z.string().min(1).optional(),
  source: z.string().max(120).optional(),
});

export async function runObserve(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound observe <add|list>");
  if (sub === "add") return addCmd(args, ctx, opts);
  if (sub === "list") return listCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: observe ${sub}`);
}

async function addCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(addInput, {
    teamId: requireFlag(args.flags, "team"),
    kind: requireFlag(args.flags, "kind"),
    body: requireFlag(args.flags, "body"),
    subject: optionalFlag(args.flags, "subject"),
    memberId: optionalFlag(args.flags, "member"),
    source: optionalFlag(args.flags, "source"),
  });
  const observation = await recordObservation(ctx, {
    teamId: data.teamId,
    kind: data.kind,
    body: data.body,
    subject: data.subject ?? null,
    memberId: data.memberId ?? null,
    source: data.source ?? null,
  });
  emit(
    observation,
    `観測を記録しました: ${observation.id} (${observation.kind})`,
    opts,
  );
}

async function listCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const kind = optionalFlag(args.flags, "kind");
  const memberId = optionalFlag(args.flags, "member");
  const observations = await listObservations(ctx, {
    teamId,
    ...(kind ? { kind: parseOrUsage(z.enum(OBSERVATION_KINDS), kind) } : {}),
    ...(memberId ? { memberId } : {}),
  });
  emit(
    observations,
    formatRows(observations, [
      "kind",
      "subject",
      "body",
      "member_id",
      "source",
      "observed_at",
    ]),
    opts,
  );
}
