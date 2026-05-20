import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { type Agenda, computeAgenda } from "../../../usecases/agenda";
import { type ParsedArgs, optionalFlag } from "../args";
import { type RenderOptions, emit } from "../output";
import { parseOrUsage } from "../zod-helper";

const horizonInput = z.coerce.number().int().min(0).max(365).default(7);

export async function runAgenda(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const horizonDays = parseOrUsage(
    horizonInput,
    optionalFlag(args.flags, "horizon-days"),
  );
  const agenda = await computeAgenda(ctx, {
    teamId: optionalFlag(args.flags, "team"),
    horizonDays,
  });
  emit(agenda, renderAgendaText(agenda), opts);
}

function renderAgendaText(a: Agenda): string {
  const lines: string[] = [`# 草野球 mound アジェンダ (${a.generated_at})`];
  if (a.team_id) lines.push(`team: ${a.team_id}`);

  lines.push("", `## 公開待ち (DRAFT): ${a.needs_publish.length}`);
  for (const g of a.needs_publish) lines.push(`  - ${g.title} (${g.id})`);

  lines.push("", `## 出欠集計中 (COLLECTING): ${a.collecting.length}`);
  for (const c of a.collecting) {
    const ready = c.ready_to_confirm ? "✅ 確定可" : `あと ${c.shortage} 人`;
    lines.push(
      `  - ${c.game.title} [${c.rsvp.available}/${c.game.min_players}] ${ready}`,
    );
  }

  lines.push(
    "",
    `## 開催間近 (CONFIRMED, ≤${a.horizon_days} 日先): ${a.upcoming.length}`,
  );
  for (const u of a.upcoming) {
    lines.push(
      `  - ${u.game.title} (${u.game.game_date}) — あと ${u.days_until} 日`,
    );
  }

  lines.push("", `## 完了入力待ち (試合日経過): ${a.needs_completion.length}`);
  for (const g of a.needs_completion)
    lines.push(`  - ${g.title} (${g.game_date})`);

  lines.push("", `## 精算待ち (COMPLETED): ${a.needs_settlement.length}`);
  for (const g of a.needs_settlement) lines.push(`  - ${g.title} (${g.id})`);

  return lines.join("\n");
}
