export interface OutputSink {
  write(line: string): void;
}

export const stdoutSink: OutputSink = {
  write(line) {
    process.stdout.write(`${line}\n`);
  },
};

export const stderrSink: OutputSink = {
  write(line) {
    process.stderr.write(`${line}\n`);
  },
};

export const OUTPUT_FORMATS = ["text", "json", "tsv", "csv"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface RenderOptions {
  format: OutputFormat;
  // format === "json" の後方互換ショートカット (一部コマンドが opts.json を見る)。
  json: boolean;
  sink: OutputSink;
}

export function emit<T>(value: T, text: string, opts: RenderOptions): void {
  switch (opts.format) {
    case "json":
      opts.sink.write(JSON.stringify(value));
      return;
    case "tsv":
      opts.sink.write(renderDelimited(value, "\t"));
      return;
    case "csv":
      opts.sink.write(renderDelimited(value, ","));
      return;
    default:
      opts.sink.write(text);
  }
}

// 値を区切り文字つきの表に整形する (tsv / csv)。
//   - 配列      → 1 レコード 1 行 (列 = 先頭レコードのキー)
//   - オブジェクト → 1 行
//   - スカラー   → value 列 1 行
// ネストした値はセル内で JSON 文字列にする。csv はカンマ/引用符/改行を含む値を quote。
export function renderDelimited(value: unknown, sep: string): string {
  const records = toRecords(value);
  if (records.length === 0) return "";
  const cols = Object.keys(records[0] ?? {});
  const esc = sep === "," ? csvField : (s: string) => s;
  const header = cols.map(esc).join(sep);
  const lines = records.map((r) => cols.map((c) => esc(cell(r[c]))).join(sep));
  return [header, ...lines].join("\n");
}

function toRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === "object")
    return [value as Record<string, unknown>];
  return [{ value }];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : { value: v };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function csvField(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function emitError(
  message: string,
  opts: { json: boolean; sink: OutputSink },
  details?: Record<string, unknown>,
): void {
  if (opts.json) {
    opts.sink.write(
      JSON.stringify({ ok: false, error: message, ...(details ?? {}) }),
    );
  } else {
    opts.sink.write(`エラー: ${message}`);
  }
}

export function formatRows<T>(
  rows: readonly T[],
  columns: ReadonlyArray<keyof T & string>,
): string {
  if (rows.length === 0) return "(該当なし)";
  const header = columns.join("\t");
  const lines = rows.map((row) =>
    columns.map((c) => String(row[c] ?? "")).join("\t"),
  );
  return [header, ...lines].join("\n");
}
