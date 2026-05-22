// CLI 駆動層: argv → adapter → JSON / text。
// mound の adapters/cli と思想を合わせる: --json は機械可読、なしは人間可読。
import { z } from "zod";
import { scrapeMock } from "./adapters/mock";
import { scrapeYokohama } from "./adapters/yokohama";
import { NotYetImplementedError, UsageError } from "./errors";
import type { GroundAvailability, SourceInfo } from "./types";

const HELP = `mound-ground-scraper — 草野球グラウンドの予約状況スクレイパ

使い方:
  mound-ground-scraper --source <SOURCE> --date YYYY-MM-DD [--ground <ID>] [--area <NAME>] [--json]
  mound-ground-scraper --list-sources [--json]
  mound-ground-scraper --help
  mound-ground-scraper --version

フラグ:
  --source <ID>       採用するスクレイパ adapter (mock | yokohama)
  --date YYYY-MM-DD   照会する日付 (必須)
  --ground <ID>       特定のグラウンドだけ (任意; 省略時は対象 source の全件)
  --area <NAME>       エリア絞り込み (yokohama のみ; 任意)
  --json              JSON 出力 (mound 側 ingest 向け)
  --list-sources      利用可能な adapter とその実装状況を出力
  --help              このヘルプ
  --version           バージョン

出力 (--json):
  GroundAvailability[] (詳細は src/types.ts 参照)

Exit code:
  0  正常終了
  2  Usage / バリデーションエラー
  3  指定 source が未実装 (yokohama など)
  1  その他
`;

const VERSION = "0.1.0";

const SOURCES: SourceInfo[] = [
  {
    id: "mock",
    label: "Mock (テスト用ダミーデータ)",
    implemented: true,
    description: "決定論的なダミーデータを返す。CI と mound 結合テスト用",
  },
  {
    id: "yokohama",
    label: "横浜市 公共施設予約システム",
    implemented: false,
    description:
      "https://yoyaku.city.yokohama.lg.jp/ — ログイン + reCAPTCHA を要するため未実装",
  },
];

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === undefined) continue;
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      if (eq > 0) {
        flags[t.slice(2, eq)] = t.slice(eq + 1);
      } else {
        const key = t.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(t);
    }
  }
  return { positional, flags };
}

function boolFlag(
  flags: Record<string, string | boolean>,
  name: string,
): boolean {
  const v = flags[name];
  return v === true || v === "true";
}

function strFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

const ScrapeInput = z.object({
  source: z.enum(["mock", "yokohama"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date は YYYY-MM-DD 形式"),
  ground: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
});

export interface RunOptions {
  argv: string[];
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  now?: () => Date;
}

export async function run(options: RunOptions): Promise<number> {
  const { argv, stdout, stderr } = options;
  const now = options.now ?? (() => new Date());
  const parsed = parseArgs(argv);
  const json = boolFlag(parsed.flags, "json");

  try {
    if (boolFlag(parsed.flags, "version")) {
      if (json) stdout(JSON.stringify({ version: VERSION }));
      else stdout(`mound-ground-scraper ${VERSION}`);
      return 0;
    }
    if (boolFlag(parsed.flags, "help") || argv.length === 0) {
      stdout(HELP);
      return 0;
    }
    if (boolFlag(parsed.flags, "list-sources")) {
      if (json) {
        stdout(JSON.stringify(SOURCES));
      } else {
        for (const s of SOURCES) {
          const impl = s.implemented ? "✅" : "🚧";
          stdout(`${impl} ${s.id.padEnd(10)} ${s.label}`);
          stdout(`   ${s.description}`);
        }
      }
      return 0;
    }

    const source = strFlag(parsed.flags, "source");
    if (!source) throw new UsageError("--source は必須です");
    const date = strFlag(parsed.flags, "date");
    if (!date) throw new UsageError("--date は必須です");
    const input = ScrapeInput.safeParse({
      source,
      date,
      ground: strFlag(parsed.flags, "ground"),
      area: strFlag(parsed.flags, "area"),
    });
    if (!input.success) {
      throw new UsageError(input.error.issues.map((i) => i.message).join("; "));
    }

    const out = dispatch(input.data, now());

    if (json) {
      stdout(JSON.stringify(out));
    } else {
      stdout(renderText(out));
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      stderr(
        json
          ? JSON.stringify({ ok: false, error: e.message })
          : `エラー: ${e.message}`,
      );
      return 2;
    }
    if (e instanceof NotYetImplementedError) {
      stderr(
        json
          ? JSON.stringify({
              ok: false,
              error: e.message,
              source: e.source,
              not_implemented: true,
            })
          : `エラー: ${e.message}`,
      );
      return 3;
    }
    const m = e instanceof Error ? e.message : String(e);
    stderr(json ? JSON.stringify({ ok: false, error: m }) : `エラー: ${m}`);
    return 1;
  }
}

function dispatch(
  input: z.infer<typeof ScrapeInput>,
  now: Date,
): GroundAvailability[] {
  if (input.source === "mock") {
    return scrapeMock({ date: input.date, groundId: input.ground, now });
  }
  // yokohama: stub が NotYetImplementedError を投げる
  return scrapeYokohama({ date: input.date, area: input.area, now });
}

function renderText(rows: GroundAvailability[]): string {
  if (rows.length === 0) return "(該当なし)";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(`# ${r.ground.name} (${r.ground.id})`);
    lines.push(
      `  source=${r.source}  area=${r.ground.area ?? "-"}  date=${r.date}`,
    );
    for (const s of r.slots) {
      const mark = s.available ? "○" : "×";
      const price = s.price_yen != null ? ` ¥${s.price_yen}` : "";
      lines.push(`  ${mark} ${s.start}-${s.end}${price}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
