import { readFileSync, writeFileSync } from "node:fs";
import type { BackupRow, UseCaseContext } from "../../../ports";
import { exportData, importData } from "../../../usecases/backup";
import { type ParsedArgs, UsageError, optionalFlag } from "../args";
import { type RenderOptions, emit } from "../output";

// mound export — 全データを JSONL で書き出す (--out PATH か stdout)。
export async function runExport(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const rows = await exportData(ctx);
  const jsonl = rows.map((r) => JSON.stringify(r)).join("\n");
  const out = optionalFlag(args.flags, "out");
  if (out) {
    writeFileSync(out, `${jsonl}\n`, "utf-8");
    emit(
      { exported: rows.length, out },
      `${rows.length} 行を書き出しました: ${out}`,
      opts,
    );
    return;
  }
  // --out 無しは JSONL をそのまま stdout へ (`mound export > backup.jsonl`)。
  opts.sink.write(jsonl);
}

// mound import — JSONL を取り込む (INSERT OR REPLACE で冪等)。
export async function runImport(
  args: ParsedArgs,
  ctx: UseCaseContext,
  opts: RenderOptions,
): Promise<void> {
  const file = optionalFlag(args.flags, "file");
  if (!file) throw new UsageError("使い方: mound import --file <PATH>");
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    throw new UsageError(`ファイルを読めません: ${file}`);
  }
  const rows: BackupRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new UsageError("JSONL の行を parse できません");
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as BackupRow).table === "string" &&
      typeof (parsed as BackupRow).data === "object"
    ) {
      rows.push(parsed as BackupRow);
    }
  }
  const result = await importData(ctx, rows);
  emit(result, `${result.imported} 行を取り込みました`, opts);
}
