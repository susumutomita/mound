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
  update(team: Team): Promise<Team>;
  remove(id: string): Promise<boolean>;
}

export interface MemberRepository {
  insert(member: Member): Promise<Member>;
  list(teamId: string): Promise<Member[]>;
  get(id: string): Promise<Member | null>;
  update(member: Member): Promise<Member>;
  remove(id: string): Promise<boolean>;
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
  update(game: Game): Promise<Game>;
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
  sinceDate?: string; // date_iso >= この日 (YYYY-MM-DD)。過去日を除外する用。
}

// 古い/過去/テストの slot を物理削除する条件。
export interface GroundSlotPruneFilter {
  beforeDate?: string; // date_iso < この日 を削除
  ingestedBefore?: string; // ingested_at < この時刻 を削除
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
  // 過去日 / 古い取得 / テストデータ (動作確認) を削除し、削除件数を返す。
  prune(filter: GroundSlotPruneFilter): Promise<number>;
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

// 全テーブルのテキスト書き出し/取り込み (バックアップ / GitHub ミラー用)。
// 1 行 = 1 レコード (JSONL にしやすい形)。Clean Architecture を保つため、
// 生 SQL でのダンプ/復元は adapters/libsql の実装に閉じ込め、ここは境界だけ定義する。
export interface BackupRow {
  table: string;
  data: Record<string, unknown>;
}

export interface BackupRepository {
  exportAll(): Promise<BackupRow[]>;
  importAll(rows: BackupRow[]): Promise<number>; // 取り込んだ行数
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
  backup: BackupRepository;
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
