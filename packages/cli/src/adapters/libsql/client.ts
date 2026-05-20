import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

export type DbClient = Client;

export interface DbConfig {
  url: string;
  authToken?: string;
}

export function buildDbConfig(
  env: Record<string, string | undefined>,
): DbConfig {
  const url =
    env.MOUND_DB_URL ??
    env.TURSO_DATABASE_URL ??
    `file:${env.HOME ?? "."}/.mound/mound.db`;
  const authToken = env.MOUND_DB_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN;
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
  const r = await db.execute("PRAGMA user_version");
  const v = r.rows[0]?.user_version;
  return typeof v === "number" ? v : Number(v ?? 0);
}

export async function migrate(db: DbClient): Promise<void> {
  await db.executeMultiple(SCHEMA_SQL);
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export async function ensureSchemaUpToDate(db: DbClient): Promise<void> {
  const current = await readSchemaVersion(db);
  if (current < SCHEMA_VERSION) {
    await migrate(db);
  }
}
