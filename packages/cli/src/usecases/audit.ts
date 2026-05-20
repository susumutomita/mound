import type { AuditLog } from "../domain/types";
import type { UseCaseContext } from "../ports";

export interface AuditEvent {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAuditLog(
  ctx: UseCaseContext,
  event: AuditEvent,
): Promise<void> {
  await ctx.repo.audit.insert({
    id: ctx.newId(),
    actor: "cli",
    action: event.action,
    target_type: event.targetType,
    target_id: event.targetId,
    before_json:
      event.before === undefined ? null : JSON.stringify(event.before),
    after_json: event.after === undefined ? null : JSON.stringify(event.after),
    created_at: ctx.now().toISOString(),
  });
}

export async function listAuditLogs(
  ctx: UseCaseContext,
  targetType: string,
  targetId: string,
): Promise<AuditLog[]> {
  return ctx.repo.audit.list(targetType, targetId);
}
