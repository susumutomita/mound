import type { UseCaseContext } from "../../../ports";
import { learnTeam } from "../../../usecases/learn";
import { type ParsedArgs, boolFlag, requireFlag } from "../args";
import { type RenderOptions, emit, formatRows } from "../output";

// mound learn — 過去の試合・出欠からチームの決め事を学習する。
// 既定は dry-run (提案のみ)。--apply で Gold (team_knowledge) に反映。
export async function runLearn(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const teamId = requireFlag(args.flags, "team");
  const apply = boolFlag(args.flags, "apply");
  const result = await learnTeam(ctx, { teamId, apply });

  const header = apply
    ? `学習結果を反映しました (${result.facts.length} 件${
        result.pinned_skips.length
          ? `, 人の決め事を尊重してスキップ ${result.pinned_skips.length} 件`
          : ""
      })`
    : `学習候補 (${result.facts.length} 件) — 反映するには --apply`;
  const text = [
    header,
    formatRows(result.facts, [
      "category",
      "key",
      "value",
      "confidence",
      "evidence_count",
      "member_name",
      "rationale",
    ]),
  ].join("\n");
  emit(result, text, opts);
}
