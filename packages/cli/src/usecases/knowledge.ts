// 🥇 Gold 層: 確信度付きの「チームの決め事」。autopilot や任意のエージェントが
// 読んで行動するための供給層。(team, member, key) で一意 = upsert する。
//
// 「使うほど賢くなる」substrate (参照: 採用実績で昇格/降格する評価機構):
//   - HUMAN (人/エージェントが明示) は LEARNED (実績から学習) に上書きされない = ピン留め
//   - LEARNED 同士は confidence が高い方が値を握る
//   - 観測のたび evidence_count を加算 = 裏付けが厚くなる
import type {
  KnowledgeCategory,
  KnowledgeOrigin,
  TeamKnowledge,
} from "../domain/types";
import type { KnowledgeFilter, UseCaseContext } from "../ports";
import { writeAuditLog } from "./audit";
import { MemberNotFoundError, TeamNotFoundError } from "./errors";

export interface RecordKnowledgeInput {
  teamId: string;
  key: string;
  value: string;
  category: KnowledgeCategory;
  memberId: string | null;
  origin: KnowledgeOrigin;
  confidence: number;
  source: string | null;
}

export async function recordKnowledge(
  ctx: UseCaseContext,
  input: RecordKnowledgeInput,
): Promise<TeamKnowledge> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  if (input.memberId) {
    const member = await ctx.repo.members.get(input.memberId);
    if (!member || member.team_id !== team.id) {
      throw new MemberNotFoundError(input.memberId);
    }
  }
  const now = ctx.now().toISOString();
  const existing = await ctx.repo.knowledge.getByKey(
    team.id,
    input.memberId,
    input.key,
  );

  if (!existing) {
    const entry: TeamKnowledge = {
      id: ctx.newId(),
      team_id: team.id,
      member_id: input.memberId,
      category: input.category,
      key: input.key,
      value: input.value,
      origin: input.origin,
      confidence: input.confidence,
      evidence_count: 1,
      source: input.source,
      last_observed_at: now,
      created_at: now,
      updated_at: now,
    };
    await ctx.repo.knowledge.insert(entry);
    await writeAuditLog(ctx, {
      action: "KNOWLEDGE_SET",
      targetType: "team_knowledge",
      targetId: entry.id,
      after: entry,
    });
    return entry;
  }

  // マージ規則: 値の勝者を決める。
  //   - 入力が HUMAN なら必ず勝つ
  //   - 既存が HUMAN なら据え置き (LEARNED で上書きしない)
  //   - 双方 LEARNED なら confidence が高い方 (同点は入力)
  const incomingWins =
    input.origin === "HUMAN" ||
    (existing.origin !== "HUMAN" && input.confidence >= existing.confidence);
  const updated: TeamKnowledge = {
    ...existing,
    category: incomingWins ? input.category : existing.category,
    value: incomingWins ? input.value : existing.value,
    origin: incomingWins ? input.origin : existing.origin,
    confidence: incomingWins ? input.confidence : existing.confidence,
    source: incomingWins ? input.source : existing.source,
    evidence_count: existing.evidence_count + 1,
    last_observed_at: now,
    updated_at: now,
  };
  await ctx.repo.knowledge.update(updated);
  await writeAuditLog(ctx, {
    action: "KNOWLEDGE_UPDATED",
    targetType: "team_knowledge",
    targetId: updated.id,
    before: existing,
    after: updated,
  });
  return updated;
}

export async function listKnowledge(
  ctx: UseCaseContext,
  filter: KnowledgeFilter,
): Promise<TeamKnowledge[]> {
  return ctx.repo.knowledge.list(filter);
}

export async function getKnowledge(
  ctx: UseCaseContext,
  teamId: string,
  key: string,
  memberId: string | null = null,
): Promise<TeamKnowledge | null> {
  return ctx.repo.knowledge.getByKey(teamId, memberId, key);
}

export async function forgetKnowledge(
  ctx: UseCaseContext,
  id: string,
): Promise<boolean> {
  return ctx.repo.knowledge.remove(id);
}

export interface LearnedFactInput {
  teamId: string;
  memberId: string | null;
  category: KnowledgeCategory;
  key: string;
  value: string;
  confidence: number;
  evidenceCount: number;
  source: string | null;
}

// 学習 (mound learn) から Gold を書く専用口。recordKnowledge の「観測ごとに加算」
// とは異なり、その時点の履歴から再導出した値で LEARNED 行を上書きする (= 降格も効く)。
// origin=HUMAN の決め事は触らない (ピン留め)。pinned=true で「人の決め事を尊重して
// スキップした」ことを呼び出し側に伝える。
export async function upsertLearnedFact(
  ctx: UseCaseContext,
  input: LearnedFactInput,
): Promise<{ entry: TeamKnowledge; pinned: boolean }> {
  const now = ctx.now().toISOString();
  const existing = await ctx.repo.knowledge.getByKey(
    input.teamId,
    input.memberId,
    input.key,
  );
  if (existing && existing.origin === "HUMAN") {
    return { entry: existing, pinned: true };
  }
  if (!existing) {
    const entry: TeamKnowledge = {
      id: ctx.newId(),
      team_id: input.teamId,
      member_id: input.memberId,
      category: input.category,
      key: input.key,
      value: input.value,
      origin: "LEARNED",
      confidence: input.confidence,
      evidence_count: input.evidenceCount,
      source: input.source,
      last_observed_at: now,
      created_at: now,
      updated_at: now,
    };
    await ctx.repo.knowledge.insert(entry);
    await writeAuditLog(ctx, {
      action: "KNOWLEDGE_LEARNED",
      targetType: "team_knowledge",
      targetId: entry.id,
      after: entry,
    });
    return { entry, pinned: false };
  }
  const updated: TeamKnowledge = {
    ...existing,
    category: input.category,
    value: input.value,
    origin: "LEARNED",
    confidence: input.confidence,
    evidence_count: input.evidenceCount,
    source: input.source,
    last_observed_at: now,
    updated_at: now,
  };
  await ctx.repo.knowledge.update(updated);
  await writeAuditLog(ctx, {
    action: "KNOWLEDGE_LEARNED",
    targetType: "team_knowledge",
    targetId: updated.id,
    before: existing,
    after: updated,
  });
  return { entry: updated, pinned: false };
}

export interface TeamPreference {
  key: string;
  value: string;
  confidence: number;
  origin: KnowledgeOrigin;
}

// autopilot 用: チーム既定値 (category=PREFERENCE, メンバー非依存) を materialize する。
export async function getTeamPreferences(
  ctx: UseCaseContext,
  teamId: string,
): Promise<TeamPreference[]> {
  const entries = await ctx.repo.knowledge.list({
    teamId,
    category: "PREFERENCE",
  });
  return entries
    .filter((e) => e.member_id === null)
    .map((e) => ({
      key: e.key,
      value: e.value,
      confidence: e.confidence,
      origin: e.origin,
    }));
}
