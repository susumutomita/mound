// CLI 層が exit code に翻訳する基準。
//   - UsageError                  → exit 2
//   - NotYetImplementedError      → exit 3 (未実装サイトを呼んだとき)
//   - その他 (Error)              → exit 1

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class NotYetImplementedError extends Error {
  readonly source: string;
  constructor(source: string, message: string) {
    super(message);
    this.name = "NotYetImplementedError";
    this.source = source;
  }
}
