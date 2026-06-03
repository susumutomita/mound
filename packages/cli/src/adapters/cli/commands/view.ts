import { z } from "zod";
import type { UseCaseContext } from "../../../ports";
import { buildDashboard, buildMemberView } from "../../../usecases/dashboard";
import { type ParsedArgs, optionalFlag, requireFlag } from "../args";
import { type RenderOptions, emit } from "../output";
import { parseOrUsage } from "../zod-helper";

const horizonInput = z.coerce.number().int().min(0).max(365).default(14);

// mound view — 今の状態を 1 コマンドで構造化スナップショットする。固定 UI は持たない。
// UI はエージェントがこの JSON から「今の関心事」だけに絞って動的生成する (--json)。
//   --member 無し: 代表/全体ビュー (管理の関心事)
//   --member M  : そのメンバー個人ビュー (自分の出欠・予定・支払いだけ。必要十分)
export async function runView(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const memberId = optionalFlag(args.flags, "member");

  if (memberId) {
    const v = await buildMemberView(ctx, { teamId, memberId });
    const text = [
      `${v.member.name} の関心事 — ${v.generated_at.slice(0, 16)}`,
      `要回答 ${v.needs_response.length} / 参加予定 ${v.upcoming.length} / 未払い ${v.dues.length}`,
      "(UI は --json を取ってエージェントが各自向けに動的生成する)",
    ].join("\n");
    emit(v, text, opts);
    return;
  }

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
