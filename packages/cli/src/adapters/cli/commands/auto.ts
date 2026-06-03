import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { planAutopilot, runAutopilot } from "../../../usecases/autopilot";
import {
  type ParsedArgs,
  UsageError,
  boolFlag,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";
import { parseOrUsage } from "../zod-helper";

const horizonSchema = z.coerce.number().int().min(0).max(365).default(7);

export async function runAuto(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0];
  if (!sub) throw new UsageError("使い方: mound auto <plan|run>");
  if (sub === "plan") return planCmd(args, ctx, opts);
  if (sub === "run") return runCmd(args, ctx, opts);
  throw new UsageError(`未知のサブコマンド: auto ${sub}`);
}

function horizonDays(args: ParsedArgs): number {
  return parseOrUsage(horizonSchema, optionalFlag(args.flags, "horizon-days"));
}

async function planCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const plan = await planAutopilot(ctx, {
    teamId,
    horizonDays: horizonDays(args),
  });
  const text = [
    `打つべき手 ${plan.actions.length} 件 (SAFE=自動実行可 / NEEDS_APPROVAL=要承認)`,
    formatRows(plan.actions, ["kind", "risk", "game_title", "reason"]),
  ].join("\n");
  emit(plan, text, opts);
}

async function runCmd(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const apply = boolFlag(args.flags, "apply");
  const result = await runAutopilot(ctx, {
    teamId,
    horizonDays: horizonDays(args),
    apply,
  });
  const head = apply
    ? `自動実行 ${result.executed.length} 件 / 要承認・保留 ${result.proposed.length} 件`
    : `dry-run: 自動実行候補 ${result.actions.filter((a) => a.risk === "SAFE").length} 件 / 要承認 ${result.proposed.filter((a) => a.risk === "NEEDS_APPROVAL").length} 件 (実行するには --apply)`;
  const lines = [head];
  if (result.executed.length) {
    lines.push(
      "--- 実行 ---",
      formatRows(
        result.executed.map((e) => ({
          kind: e.action.kind,
          game: e.action.game_title,
          ok: e.ok,
          error: e.error ?? "",
        })),
        ["kind", "game", "ok", "error"],
      ),
    );
  }
  if (result.proposed.length) {
    lines.push(
      "--- 提案 (人が決める) ---",
      formatRows(result.proposed, ["kind", "risk", "game_title", "reason"]),
    );
  }
  emit(result, lines.join("\n"), opts);
}
