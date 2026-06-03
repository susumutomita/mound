import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { readConfig } from "../config";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

export type DbClient = Client;

export interface DbConfig {
  url: string;
  authToken?: string;
}

// 接続先の決定順: 環境変数 > ~/.mound/config.json (mound config set) > 既定ファイル。
export function buildDbConfig(
  env: Record<string, string | undefined>,
): DbConfig {
  const file = readConfig(env);
  const url =
    env.MOUND_DB_URL ??
    env.TURSO_DATABASE_URL ??
    file.db_url ??
    `file:${env.HOME ?? "."}/.mound/mound.db`;
  const authToken =
    env.MOUND_DB_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN ?? file.db_auth_token;
  return { url, authToken };
}

export function ensureDbParentDir(url: string): void {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  if (path.startsWith(":memory:") || path.length === 0) return;
  const dir = dirname(path);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}

export function openDb(config: DbConfig): DbClient {
  ensureDbParentDir(config.url);
  return createClient({ url: config.url, authToken: config.authToken });
}

export async function readSchemaVersion(db: DbClient): Promise<number> {
  // 新方式: schema_meta テーブル (local/remote 両対応)。
  try {
    const r = await db.execute(
      "SELECT value FROM schema_meta WHERE key = 'schema_version'",
    );
    const v = r.rows[0]?.value;
    if (v !== undefined && v !== null) return Number(v);
  } catch {
    // schema_meta がまだ無い (初回 / 旧 DB)。下の PRAGMA フォールバックへ。
  }
  // 旧方式フォールバック: 既存ローカル DB は PRAGMA user_version を持つ。
  // remote では PRAGMA 読み取りが弾かれることがあるので try で握りつぶす。
  try {
    const r = await db.execute("PRAGMA user_version");
    const v = r.rows[0]?.user_version;
    return typeof v === "number" ? v : Number(v ?? 0);
  } catch {
    return 0;
  }
}

// 既存テーブルへのカラム追加。CREATE TABLE IF NOT EXISTS では既存 DB に列が
// 足されないため、ALTER を流す。重複 (既にある) はエラーになるので握りつぶす。
async function addColumnIfMissing(
  db: DbClient,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    // 既に存在する場合は何もしない
  }
}

export async function migrate(db: DbClient): Promise<void> {
  await db.executeMultiple(SCHEMA_SQL);
  // 既存 DB への追加カラム (新規 DB は CREATE 済みなので ALTER は no-op で握りつぶす)。
  await addColumnIfMissing(db, "games", "ground_status", "TEXT");
  // PRAGMA user_version の "書き込み" は Turso (sqld) で許可されないため、
  // スキーマ版は schema_meta テーブルに記録する (local/remote 両対応)。
  await db.execute({
    sql: "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)",
    args: [String(SCHEMA_VERSION)],
  });
}

export async function ensureSchemaUpToDate(db: DbClient): Promise<void> {
  const current = await readSchemaVersion(db);
  if (current < SCHEMA_VERSION) {
    await migrate(db);
  }
}
