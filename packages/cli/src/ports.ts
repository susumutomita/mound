// Application ports. Usecases depend only on these interfaces.
// Concrete implementations live in adapters/.
import type {
  AuditLog,
  Game,
  GameStatus,
  GroundSlot,
  GroundWatch,
  KnowledgeCategory,
  Member,
  MemberRsvp,
  NotificationChannel,
  Observation,
  ObservationKind,
  Rsvp,
  RsvpBreakdown,
  RsvpSummary,
  Settlement,
  SettlementShare,
  SettlementStatus,
  Team,
  TeamKnowledge,
} from "./domain/types";

export interface TeamRepository {
  insert(team: Team): Promise<Team>;
  list(): Promise<Team[]>;
  get(id: string): Promise<Team | null>;
}

export interface MemberRepository {
  insert(member: Member): Promise<Member>;
  list(teamId: string): Promise<Member[]>;
  get(id: string): Promise<Member | null>;
}

export interface GameRepository {
  insert(game: Game): Promise<Game>;
  list(filter: { teamId?: string; status?: GameStatus }): Promise<Game[]>;
  get(id: string): Promise<Game | null>;
  updateStatus(
    id: string,
    status: GameStatus,
    updatedAt: string,
  ): Promise<void>;
}

export interface RsvpRepository {
  upsert(rsvp: Rsvp): Promise<Rsvp>;
  list(gameId: string): Promise<Rsvp[]>;
  listWithMembers(gameId: string, teamId: string): Promise<MemberRsvp[]>;
  breakdown(gameId: string, teamId: string): Promise<RsvpBreakdown>;
  summarize(gameId: string, teamId: string): Promise<RsvpSummary>;
}

export interface AuditRepository {
  insert(log: AuditLog): Promise<AuditLog>;
  list(targetType: string, targetId: string): Promise<AuditLog[]>;
}

export interface GroundSlotFilter {
  source?: string;
  dateIso?: string;
}

export interface GroundSlotDiffFilter extends GroundSlotFilter {
  // 「この時刻以降に first_seen された slot」だけを返す。
  // ISO8601 文字列で SQL の文字列比較 (created_at TEXT) と整合させる。
  since: string;
}

export interface GroundSlotRepository {
  upsert(slot: GroundSlot): Promise<GroundSlot>;
  list(filter: GroundSlotFilter): Promise<GroundSlot[]>;
  listNewerThan(filter: GroundSlotDiffFilter): Promise<GroundSlot[]>;
  getByKey(slotKey: string): Promise<GroundSlot | null>;
}

export interface GroundWatchRepository {
  insert(watch: GroundWatch): Promise<GroundWatch>;
  list(teamId: string): Promise<GroundWatch[]>;
  listEnabled(teamId: string): Promise<GroundWatch[]>;
  get(id: string): Promise<GroundWatch | null>;
  remove(id: string): Promise<boolean>;
}

// 🥉 Bronze: 生の観測。追記専用。
export interface ObservationFilter {
  teamId: string;
  kind?: ObservationKind;
  memberId?: string;
}

export interface ObservationRepository {
  insert(observation: Observation): Promise<Observation>;
  list(filter: ObservationFilter): Promise<Observation[]>;
}

// 🥇 Gold: 確信度付きの決め事。(teamId, memberId, key) で一意。
// upsert は usecase 側で getByKey → insert/update を出し分ける (マージ規則のため)。
export interface KnowledgeFilter {
  teamId: string;
  category?: KnowledgeCategory;
  memberId?: string;
  key?: string;
}

export interface TeamKnowledgeRepository {
  insert(entry: TeamKnowledge): Promise<TeamKnowledge>;
  update(entry: TeamKnowledge): Promise<TeamKnowledge>;
  getByKey(
    teamId: string,
    memberId: string | null,
    key: string,
  ): Promise<TeamKnowledge | null>;
  list(filter: KnowledgeFilter): Promise<TeamKnowledge[]>;
  remove(id: string): Promise<boolean>;
}

// 精算 (PayPay 割り勘)。試合 1 件につき settlement 1 件 + 参加者ごとの share。
export interface SettlementRepository {
  insert(settlement: Settlement): Promise<Settlement>;
  getByGame(gameId: string): Promise<Settlement | null>;
  updateStatus(
    id: string,
    status: SettlementStatus,
    updatedAt: string,
  ): Promise<void>;
  insertShare(share: SettlementShare): Promise<SettlementShare>;
  listShares(settlementId: string): Promise<SettlementShare[]>;
  getShare(
    settlementId: string,
    memberId: string,
  ): Promise<SettlementShare | null>;
  updateSharePaid(
    id: string,
    paid: boolean,
    paidAt: string | null,
    updatedAt: string,
  ): Promise<void>;
}

export interface NotificationChannelRepository {
  insert(channel: NotificationChannel): Promise<NotificationChannel>;
  list(teamId: string): Promise<NotificationChannel[]>;
  listEnabled(teamId: string): Promise<NotificationChannel[]>;
  get(id: string): Promise<NotificationChannel | null>;
  remove(id: string): Promise<boolean>;
}

// 1 件分の送信結果。送信失敗でも例外は投げず、ok=false で返す。
// (送信エラーで上位のドメイン操作 — 試合の状態遷移など — を巻き戻したくない)
export interface NotificationDeliveryResult {
  channel_id: string;
  channel_kind: string;
  ok: boolean;
  status_code: number | null;
  error: string | null;
}

export interface NotificationSender {
  send(
    channel: NotificationChannel,
    message: string,
  ): Promise<NotificationDeliveryResult>;
}

export interface Repositories {
  teams: TeamRepository;
  members: MemberRepository;
  games: GameRepository;
  rsvps: RsvpRepository;
  audit: AuditRepository;
  groundSlots: GroundSlotRepository;
  notifications: NotificationChannelRepository;
  groundWatches: GroundWatchRepository;
  observations: ObservationRepository;
  knowledge: TeamKnowledgeRepository;
  settlements: SettlementRepository;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export interface UseCaseContext extends Clock, IdGenerator {
  repo: Repositories;
  notifier: NotificationSender;
}
