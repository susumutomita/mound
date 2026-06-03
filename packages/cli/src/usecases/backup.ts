// 全データのテキスト書き出し / 取り込み。
// ライブの読み書きは SQLite/Turso、git にはここで出した JSONL (テキスト) を置く、
// という二層運用のための薄いユースケース (実体は adapters/libsql の BackupRepository)。
import type { BackupRow, UseCaseContext } from "../ports";

export async function exportData(ctx: UseCaseContext): Promise<BackupRow[]> {
  return ctx.repo.backup.exportAll();
}

export interface ImportResult {
  imported: number;
}

export async function importData(
  ctx: UseCaseContext,
  rows: BackupRow[],
): Promise<ImportResult> {
  const imported = await ctx.repo.backup.importAll(rows);
  return { imported };
}
