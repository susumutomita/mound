import { z } from "zod";
import { RSVP_RESPONSES } from "../../../domain/types";
import type { UseCaseContext } from "../../../ports";
import {
  listRsvpsWithMembers,
  setRsvp,
  summarizeRsvps,
} from "../../../usecases/rsvp";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const setInput = z.object({
  gameId: z.string().min(1),
  memberId: z.string().min(1),
  response: z.enum(RSVP_RESPONSES),
});

export async function runRsvp(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound rsvp <set|list|summary>");
  if (sub === "set") return set(args, ctx, opts);
  if (sub === "list") return list(args, ctx, opts);
  if (sub === "summary") return summary(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: rsvp ${sub}`);
}

async function set(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const data = parseOrUsage(setInput, {
    gameId: requireFlag(args.flags, "game"),
    memberId: requireFlag(args.flags, "member"),
    response: requireFlag(args.flags, "response"),
  });
  const saved = await setRsvp(ctx, data);
  emit(saved, `RSVP を記録しました: → ${data.response}`, opts);
}

async function list(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const rows = await listRsvpsWithMembers(ctx, gameId);
  emit(
    rows,
    formatRows(rows, [
      "member_name",
      "member_role",
      "response",
      "responded_at",
    ]),
    opts,
  );
}

async function summary(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const gameId = requireFlag(args.flags, "game");
  const teamId = optionalFlag(args.flags, "team");
  const s = await summarizeRsvps(ctx, gameId, teamId);
  const text = `available=${s.available} unavailable=${s.unavailable} maybe=${s.maybe} no_response=${s.no_response}`;
  emit(s, text, opts);
}
