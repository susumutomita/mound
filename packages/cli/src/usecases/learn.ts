// 🥈 Silver→🥇 Gold: 過去の試合・出欠 (Bronze/ドメイン履歴) からチームの決め事を
// 再導出して Gold (team_knowledge) に反映する「使うほど賢くなる」エンジン。
//
// - 毎回その時点の履歴から再計算するので、傾向が変われば値も入れ替わる (= 降格も効く)。
// - origin=HUMAN の決め事は触らない (ピン留め)。pinned_skips で報告する。
// - 既定は dry-run (提案のみ)。--apply で初めて Gold に書く (AI は提案・人が決める)。
import { type KnowledgeCategory, WEEKDAY_CODES } from "../domain/types";
import type { UseCaseContext } from "../ports";
import { TeamNotFoundError } from "./errors";
import { upsertLearnedFact } from "./knowledge";

export interface LearnedFact {
  category: KnowledgeCategory;
  key: string;
  value: string;
  confidence: number;
  evidence_count: number;
  member_id: string | null;
  member_name: string | null;
  rationale: string;
}

export interface LearnResult {
  team_id: string;
  generated_at: string;
  applied: boolean;
  facts: LearnedFact[];
  pinned_skips: string[]; // 人の決め事を尊重してスキップした key
}

// 「いつもの○○」と呼べるには最低この回数の裏付けが要る。
const MIN_SAMPLE = 2;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function mode(
  counts: Map<string, number>,
): { value: string; count: number } | null {
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best;
}

export async function computeLearnedFacts(
  ctx: UseCaseContext,
  teamId: string,
): Promise<LearnedFact[]> {
  const games = await ctx.repo.games.list({ teamId });
  const members = await ctx.repo.members.list(teamId);
  const facts: LearnedFact[] = [];

  // default_ground: ground_name の最頻値
  const groundCounts = new Map<string, number>();
  let groundTotal = 0;
  for (const g of games) {
    if (!g.ground_name) continue;
    groundCounts.set(g.ground_name, (groundCounts.get(g.ground_name) ?? 0) + 1);
    groundTotal++;
  }
  const groundMode = mode(groundCounts);
  if (groundMode && groundTotal >= MIN_SAMPLE) {
    facts.push({
      category: "PREFERENCE",
      key: "default_ground",
      value: groundMode.value,
      confidence: round2(groundMode.count / groundTotal),
      evidence_count: groundMode.count,
      member_id: null,
      member_name: null,
      rationale: `会場ありの${groundTotal}試合中${groundMode.count}試合で使用`,
    });
  }

  // default_weekday: game_date の曜日の最頻値
  const weekdayCounts = new Map<string, number>();
  let weekdayTotal = 0;
  for (const g of games) {
    if (!g.game_date) continue;
    const code =
      WEEKDAY_CODES[new Date(`${g.game_date}T00:00:00Z`).getUTCDay()];
    if (!code) continue;
    weekdayCounts.set(code, (weekdayCounts.get(code) ?? 0) + 1);
    weekdayTotal++;
  }
  const weekdayMode = mode(weekdayCounts);
  if (weekdayMode && weekdayTotal >= MIN_SAMPLE) {
    facts.push({
      category: "PREFERENCE",
      key: "default_weekday",
      value: weekdayMode.value,
      confidence: round2(weekdayMode.count / weekdayTotal),
      evidence_count: weekdayMode.count,
      member_id: null,
      member_name: null,
      rationale: `日付ありの${weekdayTotal}試合中${weekdayMode.count}試合がこの曜日`,
    });
  }

  // メンバーごとの出席率 (回答した試合のうち AVAILABLE の割合)
  const responded = new Map<string, number>();
  const available = new Map<string, number>();
  for (const g of games) {
    const rows = await ctx.repo.rsvps.listWithMembers(g.id, teamId);
    for (const row of rows) {
      if (row.response === "NO_RESPONSE") continue;
      responded.set(row.member_id, (responded.get(row.member_id) ?? 0) + 1);
      if (row.response === "AVAILABLE") {
        available.set(row.member_id, (available.get(row.member_id) ?? 0) + 1);
      }
    }
  }
  for (const m of members) {
    const resp = responded.get(m.id) ?? 0;
    if (resp < MIN_SAMPLE) continue;
    const avail = available.get(m.id) ?? 0;
    facts.push({
      category: "ROSTER",
      key: "attendance_rate",
      value: `${round2(avail / resp)} (${avail}/${resp})`,
      confidence: round2(Math.min(1, resp / 5)), // 5 試合以上の回答で満点
      evidence_count: resp,
      member_id: m.id,
      member_name: m.name,
      rationale: `回答${resp}試合中${avail}試合で参加可`,
    });
  }

  return facts;
}

export interface LearnTeamInput {
  teamId: string;
  apply: boolean;
}

export async function learnTeam(
  ctx: UseCaseContext,
  input: LearnTeamInput,
): Promise<LearnResult> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const facts = await computeLearnedFacts(ctx, team.id);
  const pinnedSkips: string[] = [];
  if (input.apply) {
    const stamp = ctx.now().toISOString().slice(0, 10);
    for (const f of facts) {
      const { pinned } = await upsertLearnedFact(ctx, {
        teamId: team.id,
        memberId: f.member_id,
        category: f.category,
        key: f.key,
        value: f.value,
        confidence: f.confidence,
        evidenceCount: f.evidence_count,
        source: `learn:${stamp}`,
      });
      if (pinned) {
        pinnedSkips.push(f.member_id ? `${f.key}@${f.member_id}` : f.key);
      }
    }
  }
  return {
    team_id: team.id,
    generated_at: ctx.now().toISOString(),
    applied: input.apply,
    facts,
    pinned_skips: pinnedSkips,
  };
}
