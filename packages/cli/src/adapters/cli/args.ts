export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq > 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

export function requireFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string {
  const v = flags[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new UsageError(`--${name} は必須です`);
  }
  return v;
}

export function optionalFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

export function boolFlag(
  flags: Record<string, string | boolean>,
  name: string,
): boolean {
  const v = flags[name];
  return v === true || v === "true";
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
