import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { buildDashboard } from "../../../usecases/dashboard";
import { type ParsedArgs, optionalFlag, requireFlag } from "../args";
import { type RenderOptions, emit } from "../output";
import { parseOrUsage } from "../zod-helper";

const horizonInput = z.coerce.number().int().min(0).max(365).default(14);

// mound view — 今のチーム状態を 1 コマンドで構造化スナップショットする。
// 固定 UI は持たない: これはデータ供給。UI(HTML 等)はエージェントがこの JSON から
// 「今の関心事」だけに絞って動的生成する想定 (--json を使うこと)。
export async function runView(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const horizonDays = parseOrUsage(
    horizonInput,
    optionalFlag(args.flags, "horizon-days"),
  );
  const dashboard = await buildDashboard(ctx, { teamId, horizonDays });

  const a = dashboard.agenda;
  const text = [
    `${dashboard.team.name} (${dashboard.team.home_area ?? "本拠地未設定"}) — ${dashboard.generated_at.slice(0, 16)}`,
    `今やること: 公開待ち ${a.needs_publish.length} / 出欠集め ${a.collecting.length} / 直近 ${a.upcoming.length} / 要完了 ${a.needs_completion.length} / 要精算 ${a.needs_settlement.length}`,
    `試合 ${dashboard.games.length} 件 / 実行時点以降の空き ${dashboard.ground_slots.length} 件 / 決め事 ${dashboard.knowledge.length} 件`,
    "(UI は --json を取ってエージェントが動的生成する)",
  ].join("\n");
  emit(dashboard, text, opts);
}
