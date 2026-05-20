import type { UseCaseContext } from "../../../ports";
import { listAuditLogs } from "../../../usecases/audit";
import {
  type ParsedArgs,
  UsageError,
  optionalFlag,
  requireFlag,
} from "../args";
import { type RenderOptions, emit, formatRows } from "../output";

export async function runAudit(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  if (args.positional.length > 0) {
    throw new UsageError(`未知の引数: ${args.positional.join(" ")}`);
  }
  const targetType = optionalFlag(args.flags, "type") ?? "game";
  const targetId = requireFlag(args.flags, "target");
  const logs = await listAuditLogs(ctx, targetType, targetId);
  emit(logs, formatRows(logs, ["created_at", "action", "actor"]), opts);
}
