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

export interface RenderOptions {
  json: boolean;
  sink: OutputSink;
}

export function emit<T>(value: T, text: string, opts: RenderOptions): void {
  if (opts.json) {
    opts.sink.write(JSON.stringify(value));
  } else {
    opts.sink.write(text);
  }
}

export function emitError(
  message: string,
  opts: { json: boolean; sink: OutputSink },
): void {
  if (opts.json) {
    opts.sink.write(JSON.stringify({ ok: false, error: message }));
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
