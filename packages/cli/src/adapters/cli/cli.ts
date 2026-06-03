import {
  type DbClient,
  buildDbConfig,
  ensureSchemaUpToDate,
  openDb,
} from "../libsql/client";
import { type ParsedArgs, UsageError, boolFlag, parseArgs } from "./args";

const USER_ERROR_NAMES = new Set([
  "UsageError",
  "TransitionDeniedError",
  "NotFoundError",
  "TeamNotFoundError",
  "GameNotFoundError",
  "MemberNotFoundError",
  "CrossTeamRsvpError",
]);

function isUserError(e: unknown): boolean {
  if (e instanceof UsageError) return true;
  if (e instanceof Error && USER_ERROR_NAMES.has(e.name)) return true;
  return false;
}
import type { NotificationSender } from "../../ports";
import { TransitionDeniedError } from "../../usecases/errors";
import { runAgenda } from "./commands/agenda";
import { runAudit } from "./commands/audit";
import { runGame } from "./commands/game";
import { runGround } from "./commands/ground";
import { runInit } from "./commands/init";
import { runKnowledge } from "./commands/knowledge";
import { runLearn } from "./commands/learn";
import { runMember } from "./commands/member";
import { runNotify } from "./commands/notify";
import { runObserve } from "./commands/observe";
import { runRsvp } from "./commands/rsvp";
import { runTeam } from "./commands/team";
import { runWatch } from "./commands/watch";
import { composeContext } from "./compose";
import { HELP, VERSION, findCommandHelp } from "./help";
import {
  type OutputSink,
  emit,
  emitError,
  stderrSink,
  stdoutSink,
} from "./output";

export interface RunOptions {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout?: OutputSink;
  stderr?: OutputSink;
  db?: DbClient;
  now?: () => Date;
  newId?: () => string;
  notifier?: NotificationSender;
}

export async function run(options: RunOptions): Promise<number> {
  const stdout = options.stdout ?? stdoutSink;
  const stderr = options.stderr ?? stderrSink;
  const parsed = parseArgs(options.argv);
  const json = boolFlag(parsed.flags, "json");
  const renderOpts = { json, sink: stdout };

  if (boolFlag(parsed.flags, "version")) {
    emit({ version: VERSION }, `mound ${VERSION}`, renderOpts);
    return 0;
  }
  if (boolFlag(parsed.flags, "help")) {
    stdout.write(findCommandHelp(parsed.positional) ?? HELP);
    return 0;
  }
  if (parsed.positional.length === 0) {
    stdout.write(HELP);
    return 0;
  }

  const [command, ...rest] = parsed.positional;
  const subArgs: ParsedArgs = { positional: rest, flags: parsed.flags };
  const ownsDb = !options.db;
  let db: DbClient | null = null;

  try {
    db = options.db ?? openDb(buildDbConfig(options.env));
    if (command !== "init") {
      await ensureSchemaUpToDate(db);
    }
    const ctx = composeContext({
      db,
      env: options.env,
      now: options.now ?? (() => new Date()),
      newId: options.newId ?? (() => crypto.randomUUID()),
      notifier: options.notifier,
    });

    switch (command) {
      case "init":
        await runInit(db, renderOpts);
        return 0;
      case "team":
        await runTeam(subArgs, ctx, renderOpts);
        return 0;
      case "member":
        await runMember(subArgs, ctx, renderOpts);
        return 0;
      case "game":
        await runGame(subArgs, ctx, renderOpts);
        return 0;
      case "rsvp":
        await runRsvp(subArgs, ctx, renderOpts);
        return 0;
      case "audit":
        await runAudit(subArgs, ctx, renderOpts);
        return 0;
      case "agenda":
        await runAgenda(subArgs, ctx, renderOpts);
        return 0;
      case "ground":
        await runGround(subArgs, ctx, renderOpts);
        return 0;
      case "notify":
        await runNotify(subArgs, ctx, renderOpts);
        return 0;
      case "watch":
        await runWatch(subArgs, ctx, renderOpts);
        return 0;
      case "observe":
        await runObserve(subArgs, ctx, renderOpts);
        return 0;
      case "knowledge":
        await runKnowledge(subArgs, ctx, renderOpts);
        return 0;
      case "learn":
        await runLearn(subArgs, ctx, renderOpts);
        return 0;
      default:
        emitError(`未知のコマンド: ${command}`, { json, sink: stderr });
        return 2;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const details =
      e instanceof TransitionDeniedError ? e.toDetails() : undefined;
    emitError(message, { json, sink: stderr }, details);
    return isUserError(e) ? 2 : 1;
  } finally {
    if (ownsDb && db) {
      try {
        db.close();
      } catch {
        // libSQL clients may already be closed
      }
    }
  }
}
