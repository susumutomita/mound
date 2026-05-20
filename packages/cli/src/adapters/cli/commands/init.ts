import { migrate } from "../../libsql/client";
import type { DbClient } from "../../libsql/client";
import { type RenderOptions, emit } from "../output";

export async function runInit(
  db: DbClient,
  opts: RenderOptions,
): Promise<void> {
  await migrate(db);
  emit({ ok: true }, "DB を初期化しました", opts);
}
