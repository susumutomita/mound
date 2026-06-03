export const GAME_STATUSES = [
  "DRAFT",
  "COLLECTING",
  "CONFIRMED",
  "COMPLETED",
  "SETTLED",
  "CANCELLED",
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const RSVP_RESPONSES = [
  "AVAILABLE",
  "UNAVAILABLE",
  "MAYBE",
  "NO_RESPONSE",
] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export const MEMBER_ROLES = ["ADMIN", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const NOTIFICATION_KINDS = ["DISCORD", "SLACK", "LINE"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Team {
  id: string;
  name: string;
  home_area: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  team_id: string;
  name: string;
  email: string | null;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  team_id: string;
  title: string;
  status: GameStatus;
  game_date: string | null;
  ground_name: string | null;
  min_players: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rsvp {
  id: string;
  game_id: string;
  member_id: string;
  response: RsvpResponse;
  responded_at: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

export interface RsvpSummary {
  available: number;
  unavailable: number;
  maybe: number;
  no_response: number;
}

export interface MemberRsvp {
  member_id: string;
  member_name: string;
  member_role: MemberRole;
  response: RsvpResponse;
  responded_at: string | null;
}

export interface RsvpBreakdown {
  available: MemberRsvp[];
  unavailable: MemberRsvp[];
  maybe: MemberRsvp[];
  no_response: MemberRsvp[];
}

// チームに紐づく通知チャネル設定。
// kind === "DISCORD" | "SLACK" は webhook_url 単独で動く。
// kind === "LINE"  は LINE Messaging API push を想定:
//   webhook_url: 'https://api.line.me/v2/bot/message/push' 固定の想定
//   secret:      チャネルアクセストークン (Authorization: Bearer)
//   target:      送信先 userId / groupId
export interface NotificationChannel {
  id: string;
  team_id: string;
  kind: NotificationKind;
  webhook_url: string;
  secret: string | null;
  target: string | null;
  label: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 曜日コード (ISO weekday の小文字 3 文字)。watch.weekdays は CSV で持つ。
export const WEEKDAY_CODES = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

// チームが「気になるグラウンド条件」を 1 件表す。
// 各フィールドは null なら任意 (= フィルタしない) 扱い。複数フィールドは AND。
// 同じ team に複数 watch があれば OR (どれか 1 つにマッチしたら通す)。
export interface GroundWatch {
  id: string;
  team_id: string;
  label: string | null;
  source: string | null;
  facility_pattern: string | null; // SQL LIKE パターン (例: '%野球場%')
  weekdays: string | null; // CSV 'sat,sun' / null=任意
  time_from: string | null; // 'HH:MM' / null=任意 (slot の開始がこれ以降)
  time_to: string | null; // 'HH:MM' / null=任意 (slot の終了がこれ以前)
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// === チーム記憶レイヤ (Medallion: Bronze→Silver→Gold) ===
// mound は「チームの記憶」。決め事を mound (libSQL/SQLite) に貯めることで、
// 駆動するエージェント (Hermes / Codex / Claude) を差し替えても同じ文脈から動ける。

// 🥉 Bronze: エージェントが会話などで得た「生の観測」。追記専用・不変。
// 構造を決めずにまず書き留める層 (例: 「土曜の朝が動きやすい」「鈴木は隔週」)。
export const OBSERVATION_KINDS = [
  "PREFERENCE_HINT", // 既定値のヒント (動きやすい曜日・時間帯など)
  "ROSTER_FACT", // メンバーに関する事実 (背番号/ポジション/常連か等)
  "VENUE", // 会場に関する知見
  "RULE", // 規約・会費・連絡網など
  "OPPONENT", // 対戦相手に関する知見
  "NOTE", // その他の自由メモ
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export interface Observation {
  id: string;
  team_id: string;
  member_id: string | null; // メンバー固有の観測なら紐づける
  kind: ObservationKind;
  subject: string | null; // 任意の見出し
  body: string; // 観測の中身
  source: string | null; // 出所 ("会話 2026-06-03" 等)
  observed_at: string;
  created_at: string;
}

// 🥇 Gold: 確信度付きの「チームの決め事」。供給用 (autopilot / 任意のエージェントが
// 読んで行動する層)。(team_id, member_id, key) で一意 = upsert する。
export const KNOWLEDGE_CATEGORIES = [
  "PREFERENCE", // 既定値 (default_ground / default_weekday / fee_per_person 等)
  "RULE", // 規約・会費ルール・ドタキャン規定
  "ROSTER", // メンバー固有の知識
  "VENUE", // 会場の知見
  "OPPONENT", // 対戦相手の知見
  "NOTE", // その他
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

// 決め事の出所。HUMAN = 人/エージェントが明示設定 (権威があり、学習値に上書きされない)。
// LEARNED = 実績から学習したもの。
export const KNOWLEDGE_ORIGINS = ["HUMAN", "LEARNED"] as const;
export type KnowledgeOrigin = (typeof KNOWLEDGE_ORIGINS)[number];

export interface TeamKnowledge {
  id: string;
  team_id: string;
  member_id: string | null;
  category: KnowledgeCategory;
  key: string; // default_ground / fee_per_person / position 等
  value: string;
  origin: KnowledgeOrigin;
  confidence: number; // 0.0–1.0
  evidence_count: number; // 観測/裏付けの累積回数 (使うほど厚くなる)
  source: string | null;
  last_observed_at: string | null;
  created_at: string;
  updated_at: string;
}

// 外部スクレイパ (ground-reservation 等) から ingest した 1 件の空き枠。
// slot_key = source|facility_name|date_iso|time_range (UNIQUE)
//   ingest 時にこのキーで upsert する。
// first_seen_at = 最初に観測した時刻 (新規 vs 継続を後から見るため)。
// ingested_at   = 直近の取り込み時刻。
export interface GroundSlot {
  id: string;
  slot_key: string;
  source: string;
  facility_name: string;
  date_iso: string | null;
  date_raw: string;
  time_range: string | null;
  status: string | null;
  raw: string;
  scraped_at: string;
  first_seen_at: string;
  ingested_at: string;
}
