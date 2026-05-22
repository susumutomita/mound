import {
  type GroundSlot,
  type GroundWatch,
  WEEKDAY_CODES,
  type WeekdayCode,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { TeamNotFoundError } from "./errors";

export interface AddGroundWatchInput {
  teamId: string;
  label: string | null;
  source: string | null;
  facilityPattern: string | null;
  weekdays: string | null; // 'sat,sun' / null
  timeFrom: string | null;
  timeTo: string | null;
}

export async function addGroundWatch(
  ctx: UseCaseContext,
  input: AddGroundWatchInput,
): Promise<GroundWatch> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const now = ctx.now().toISOString();
  const watch: GroundWatch = {
    id: ctx.newId(),
    team_id: team.id,
    label: input.label,
    source: input.source,
    facility_pattern: input.facilityPattern,
    weekdays: input.weekdays,
    time_from: input.timeFrom,
    time_to: input.timeTo,
    enabled: true,
    created_at: now,
    updated_at: now,
  };
  return ctx.repo.groundWatches.insert(watch);
}

export async function listGroundWatches(
  ctx: UseCaseContext,
  teamId: string,
): Promise<GroundWatch[]> {
  return ctx.repo.groundWatches.list(teamId);
}

export async function removeGroundWatch(
  ctx: UseCaseContext,
  id: string,
): Promise<boolean> {
  return ctx.repo.groundWatches.remove(id);
}

// LIKE パターン (% = 任意の文字列, _ = 任意の 1 文字) を JS regex に変換して一致判定する。
// SQL LIKE 互換だが、本実装ではメモリ上で評価する。
function likeMatches(text: string, pattern: string): boolean {
  // 正規表現メタ文字を escape したうえで % と _ をワイルドカードに展開
  const escaped = pattern.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  const regexSrc = `^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`;
  return new RegExp(regexSrc).test(text);
}

function parseWeekdayCsv(csv: string): WeekdayCode[] {
  const valid = new Set<string>(WEEKDAY_CODES);
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is WeekdayCode => valid.has(s));
}

function weekdayOf(dateIso: string): WeekdayCode | null {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // getUTCDay: 0=Sun..6=Sat ↔ WEEKDAY_CODES[0]=sun..[6]=sat の順で揃えてある
  return WEEKDAY_CODES[d.getUTCDay()] ?? null;
}

function timeRangeStart(timeRange: string | null): string | null {
  if (!timeRange) return null;
  const [start] = timeRange.split("-");
  return start ?? null;
}

function timeRangeEnd(timeRange: string | null): string | null {
  if (!timeRange) return null;
  const parts = timeRange.split("-");
  return parts[1] ?? null;
}

// 1 つの watch に 1 つの slot がマッチするか。
// 各条件は null なら任意、値ありなら AND 評価。
export function slotMatchesWatch(
  slot: GroundSlot,
  watch: GroundWatch,
): boolean {
  if (!watch.enabled) return false;
  if (watch.source && slot.source !== watch.source) return false;
  if (
    watch.facility_pattern &&
    !likeMatches(slot.facility_name, watch.facility_pattern)
  ) {
    return false;
  }
  if (watch.weekdays) {
    if (!slot.date_iso) return false;
    const days = parseWeekdayCsv(watch.weekdays);
    if (days.length === 0) return false; // CSV 全部不正値なら何も通さない
    const dow = weekdayOf(slot.date_iso);
    if (!dow || !days.includes(dow)) return false;
  }
  if (watch.time_from) {
    const start = timeRangeStart(slot.time_range);
    if (!start || start < watch.time_from) return false;
  }
  if (watch.time_to) {
    const end = timeRangeEnd(slot.time_range);
    if (!end || end > watch.time_to) return false;
  }
  return true;
}

// team の watches で slot をフィルタする。
//   - watch 0 件 → 全件通す (後方互換)
//   - watch 複数 → どれか 1 つにマッチで通す (OR)
export async function filterSlotsByTeamWatches(
  ctx: UseCaseContext,
  teamId: string,
  slots: GroundSlot[],
): Promise<GroundSlot[]> {
  const watches = await ctx.repo.groundWatches.listEnabled(teamId);
  if (watches.length === 0) return slots;
  return slots.filter((s) => watches.some((w) => slotMatchesWatch(s, w)));
}
