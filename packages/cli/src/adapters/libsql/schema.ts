export const SCHEMA_VERSION = 7;

export const SCHEMA_SQL = `
-- スキーマ版を記録するメタテーブル。PRAGMA user_version の書き込みは Turso (sqld)
-- で許可されないため、バージョンはここに普通の SQL で記録する (local/remote 両対応)。
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_area TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT','COLLECTING','CONFIRMED','COMPLETED','SETTLED','CANCELLED')
  ),
  game_date TEXT,
  ground_name TEXT,
  ground_status TEXT,
  min_players INTEGER NOT NULL DEFAULT 9,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_team ON games(team_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (
    response IN ('AVAILABLE','UNAVAILABLE','MAYBE','NO_RESPONSE')
  ),
  responded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(game_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_rsvps_game ON rsvps(game_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);

-- 外部スクレイパ (ground-reservation 等) から取り込んだグラウンドの空き枠。
-- slot_key = source|facility_name|date_iso|time_range で upsert する。
CREATE TABLE IF NOT EXISTS ground_slots (
  id TEXT PRIMARY KEY,
  slot_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  date_iso TEXT,
  date_raw TEXT NOT NULL,
  time_range TEXT,
  status TEXT,
  raw TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ground_slots_source ON ground_slots(source);
CREATE INDEX IF NOT EXISTS idx_ground_slots_date ON ground_slots(date_iso);

-- 通知チャネル設定。Discord/Slack は webhook_url のみ、LINE Messaging API は
-- webhook_url + secret (channel access token) + target (user/group id) を使う。
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('DISCORD', 'SLACK', 'LINE')),
  webhook_url TEXT NOT NULL,
  secret TEXT,
  target TEXT,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_channels_team ON notification_channels(team_id);

-- チームごとの「気になるグラウンド条件」。各フィールド null は任意 (フィルタしない)。
-- 同じ team の watch は OR で評価する。
CREATE TABLE IF NOT EXISTS ground_watches (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT,
  source TEXT,
  facility_pattern TEXT,
  weekdays TEXT,
  time_from TEXT,
  time_to TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ground_watches_team ON ground_watches(team_id);

-- 🥉 Bronze: チームの記憶。エージェントが会話で得た「生の観測」。追記専用・不変。
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  source TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_team ON observations(team_id);

-- 🥇 Gold: 確信度付きの「チームの決め事」。(team_id, member_id, key) で一意。
-- origin=HUMAN は LEARNED に上書きされない。evidence_count は裏付けの累積回数。
CREATE TABLE IF NOT EXISTS team_knowledge (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('HUMAN', 'LEARNED')),
  confidence REAL NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  source TEXT,
  last_observed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(team_id, member_id, key)
);
CREATE INDEX IF NOT EXISTS idx_team_knowledge_team ON team_knowledge(team_id);

-- 精算 (PayPay 割り勘)。試合 1 件につき 1 件。
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  total_amount INTEGER NOT NULL,
  payment_link TEXT,
  payment_label TEXT,
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'SETTLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_team ON settlements(team_id);

-- 割り勘の参加者ごとの負担額と支払状況。
CREATE TABLE IF NOT EXISTS settlement_shares (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(settlement_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_settlement_shares_settlement ON settlement_shares(settlement_id);
`;
