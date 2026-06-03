// mound の接続設定を ~/.mound/config.json に保存/読込する。
// 環境変数を使わずに `mound config set` で DB URL / 認証トークンを永続化できる。
// トークンは秘密なのでファイルは owner-only (0600) で書く。
//
// libsql/client.ts (buildDbConfig) と cli/commands/config.ts の両方から使うため、
// adapters/libsql でも adapters/cli でもない中立な場所に置く (依存方向の禁則を侵さない)。
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface MoundConfig {
  db_url?: string;
  db_auth_token?: string;
}

export function configFilePath(
  env: Record<string, string | undefined>,
): string {
  return `${env.HOME ?? "."}/.mound/config.json`;
}

export function readConfig(
  env: Record<string, string | undefined>,
): MoundConfig {
  try {
    const parsed = JSON.parse(readFileSync(configFilePath(env), "utf-8"));
    if (parsed && typeof parsed === "object") return parsed as MoundConfig;
  } catch {
    // ファイルが無い / 壊れている場合は空設定として扱う
  }
  return {};
}

export function writeConfig(
  env: Record<string, string | undefined>,
  patch: MoundConfig,
): MoundConfig {
  const path = configFilePath(env);
  mkdirSync(dirname(path), { recursive: true });
  const merged: MoundConfig = { ...readConfig(env), ...patch };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600); // 既存ファイルにも owner-only を保証する
  return merged;
}
