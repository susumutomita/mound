import type { UseCaseContext } from "../../ports";
import type { DbClient } from "../libsql/client";
import { buildRepositories } from "../libsql/repositories";

export interface ComposeOptions {
  db: DbClient;
  now: () => Date;
  newId: () => string;
}

export function composeContext(options: ComposeOptions): UseCaseContext {
  return {
    repo: buildRepositories(options.db),
    now: options.now,
    newId: options.newId,
  };
}
