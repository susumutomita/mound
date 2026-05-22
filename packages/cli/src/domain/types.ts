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
