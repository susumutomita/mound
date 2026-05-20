export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
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
`;
