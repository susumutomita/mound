import {
  type MoundConfig,
  configFilePath,
  readConfig,
  writeConfig,
} from "../../config";
import { type ParsedArgs, UsageError, optionalFlag } from "../args";
import { type RenderOptions, emit } from "../output";

// 秘密トークンは全表示しない。設定有無と末尾4文字だけ見せる。
function maskToken(token: string | undefined): string {
  if (!token) return "(未設定)";
  return token.length > 4 ? `****${token.slice(-4)}` : "****";
}

// mound config — 接続先 (DB URL / 認証トークン) を ~/.mound/config.json に保存。
// この設定は DB を開く前に読むので、ctx を受け取らず env だけで動く。
export async function runConfig(
  args: ParsedArgs,
  env: Record<string, string | undefined>,
  opts: RenderOptions,
): Promise<void> {
  const sub = args.positional[0] ?? "show";
  if (sub === "show") return show(env, opts);
  if (sub === "set") return set(args, env, opts);
  if (sub === "path") {
    emit({ path: configFilePath(env) }, configFilePath(env), opts);
    return;
  }
  throw new UsageError(`未知のサブコマンド: config ${sub}`);
}

async function show(
  env: Record<string, string | undefined>,
  opts: RenderOptions,
): Promise<void> {
  const cfg = readConfig(env);
  // JSON ではトークンを生で出さない (マスク)。
  emit(
    {
      path: configFilePath(env),
      db_url: cfg.db_url ?? null,
      db_auth_token: cfg.db_auth_token ? maskToken(cfg.db_auth_token) : null,
    },
    [
      `config: ${configFilePath(env)}`,
      `db_url: ${cfg.db_url ?? "(未設定 → 既定の ~/.mound/mound.db)"}`,
      `db_auth_token: ${maskToken(cfg.db_auth_token)}`,
    ].join("\n"),
    opts,
  );
}

async function set(
  args: ParsedArgs,
  env: Record<string, string | undefined>,
  opts: RenderOptions,
): Promise<void> {
  const dbUrl = optionalFlag(args.flags, "db-url");
  const dbToken = optionalFlag(args.flags, "db-token");
  if (dbUrl === undefined && dbToken === undefined) {
    throw new UsageError("--db-url か --db-token を指定してください");
  }
  const patch: MoundConfig = {};
  if (dbUrl !== undefined) patch.db_url = dbUrl;
  if (dbToken !== undefined) patch.db_auth_token = dbToken;
  const merged = writeConfig(env, patch);
  emit(
    {
      path: configFilePath(env),
      db_url: merged.db_url ?? null,
      db_auth_token: merged.db_auth_token
        ? maskToken(merged.db_auth_token)
        : null,
    },
    `設定を保存しました (${configFilePath(env)}, 0600)\n` +
      `db_url: ${merged.db_url ?? "(未設定)"}\n` +
      `db_auth_token: ${maskToken(merged.db_auth_token)}`,
    opts,
  );
}
