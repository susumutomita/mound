import type { NotificationSender, UseCaseContext } from "../../ports";
import type { DbClient } from "../libsql/client";
import { buildRepositories } from "../libsql/repositories";
import { buildNotifierFromEnv } from "../notification/sender";

export interface ComposeOptions {
  db: DbClient;
  env: Record<string, string | undefined>;
  now: () => Date;
  newId: () => string;
  // テスト等で notifier を差し替えるための override。
  notifier?: NotificationSender;
}

export function composeContext(options: ComposeOptions): UseCaseContext {
  return {
    repo: buildRepositories(options.db),
    notifier: options.notifier ?? buildNotifierFromEnv(options.env),
    now: options.now,
    newId: options.newId,
  };
}
