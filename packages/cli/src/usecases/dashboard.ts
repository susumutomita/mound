// ビューアー(HTML ダッシュボード)用のデータ集計。
// 「トモがスマホで今の状況をパッと見る」ためのスナップショット。既存 usecase を再利用。
import type {
  Game,
  GroundSlot,
  Member,
  RsvpBreakdown,
  RsvpResponse,
  Team,
  TeamKnowledge,
} from "../domain/types";
import type { UseCaseContext } from "../ports";
import { type Agenda, computeAgenda } from "./agenda";
import { MemberNotFoundError, TeamNotFoundError } from "./errors";
import { listGroundSlots } from "./ground";
import { listKnowledge } from "./knowledge";
import { type SettlementView, getSettlement } from "./settlement";

export interface DashboardGame {
  game: Game;
  rsvp: RsvpBreakdown;
  available: number;
  unavailable: number;
  maybe: number;
  no_response: number;
  shortage: number; // 成立まであと何人 (min_players - available, 0 以上)
  settlement: SettlementView | null;
}

export interface Dashboard {
  team: Team;
  generated_at: string;
  horizon_days: number;
  agenda: Agenda;
  games: DashboardGame[]; // 進行中の試合 (CANCELLED/SETTLED 以外) を日付順
  ground_slots: GroundSlot[]; // 実行時点以降の空き
  knowledge: TeamKnowledge[];
}

export interface BuildDashboardInput {
  teamId: string;
  horizonDays: number;
}

export async function buildDashboard(
  ctx: UseCaseContext,
  input: BuildDashboardInput,
): Promise<Dashboard> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);

  const agenda = await computeAgenda(ctx, {
    teamId: team.id,
    horizonDays: input.horizonDays,
  });

  const all = await ctx.repo.games.list({ teamId: team.id });
  const active = all.filter(
    (g) => g.status !== "CANCELLED" && g.status !== "SETTLED",
  );
  active.sort((a, b) =>
    (a.game_date ?? "9999").localeCompare(b.game_date ?? "9999"),
  );

  const games: DashboardGame[] = [];
  for (const game of active) {
    const rsvp = await ctx.repo.rsvps.breakdown(game.id, game.team_id);
    const available = rsvp.available.length;
    const settlement =
      game.status === "COMPLETED" ? await getSettlement(ctx, game.id) : null;
    games.push({
      game,
      rsvp,
      available,
      unavailable: rsvp.unavailable.length,
      maybe: rsvp.maybe.length,
      no_response: rsvp.no_response.length,
      shortage: Math.max(0, game.min_players - available),
      settlement,
    });
  }

  const today = ctx.now().toISOString().slice(0, 10);
  const [groundSlots, knowledge] = await Promise.all([
    listGroundSlots(ctx, { sinceDate: today }),
    listKnowledge(ctx, { teamId: team.id }),
  ]);

  return {
    team,
    generated_at: ctx.now().toISOString(),
    horizon_days: input.horizonDays,
    agenda,
    games,
    ground_slots: groundSlots,
    knowledge,
  };
}

// === メンバー個人ビュー: その人の関心事だけ (必要十分) ===
// 代表は全体管理、メンバーは「自分の出欠・予定・支払い」だけ見たい。
export interface MemberDue {
  game: Game;
  amount: number;
  payment_link: string | null;
  payment_label: string | null;
}

export interface MemberView {
  team: Team;
  member: Member;
  generated_at: string;
  needs_response: Game[]; // 出欠未回答/未定の試合 (要アクション)
  upcoming: { game: Game; my_response: RsvpResponse }[]; // 参加予定 (自分が AVAILABLE)
  dues: MemberDue[]; // 自分の未払い精算
}

export async function buildMemberView(
  ctx: UseCaseContext,
  input: { teamId: string; memberId: string },
): Promise<MemberView> {
  const team = await ctx.repo.teams.get(input.teamId);
  if (!team) throw new TeamNotFoundError(input.teamId);
  const member = await ctx.repo.members.get(input.memberId);
  if (!member || member.team_id !== team.id) {
    throw new MemberNotFoundError(input.memberId);
  }

  const today = ctx.now().toISOString().slice(0, 10);
  const games = await ctx.repo.games.list({ teamId: team.id });

  const needsResponse: Game[] = [];
  const upcoming: { game: Game; my_response: RsvpResponse }[] = [];
  const dues: MemberDue[] = [];

  for (const game of games) {
    const future = !game.game_date || game.game_date >= today;
    const mine = (await ctx.repo.rsvps.list(game.id)).find(
      (r) => r.member_id === member.id,
    );
    const resp: RsvpResponse = mine?.response ?? "NO_RESPONSE";

    if (
      game.status === "COLLECTING" &&
      future &&
      (resp === "NO_RESPONSE" || resp === "MAYBE")
    ) {
      needsResponse.push(game);
    }
    if (
      future &&
      resp === "AVAILABLE" &&
      (game.status === "COLLECTING" || game.status === "CONFIRMED")
    ) {
      upcoming.push({ game, my_response: resp });
    }
    if (game.status === "COMPLETED") {
      const view = await getSettlement(ctx, game.id);
      const share = view?.shares.find((s) => s.member_id === member.id);
      if (share && !share.paid) {
        dues.push({
          game,
          amount: share.amount,
          payment_link: view?.settlement.payment_link ?? null,
          payment_label: view?.settlement.payment_label ?? null,
        });
      }
    }
  }

  const byDate = (a: Game, b: Game) =>
    (a.game_date ?? "9999").localeCompare(b.game_date ?? "9999");
  needsResponse.sort(byDate);
  upcoming.sort((a, b) => byDate(a.game, b.game));

  return {
    team,
    member,
    generated_at: ctx.now().toISOString(),
    needs_response: needsResponse,
    upcoming,
    dues,
  };
}
