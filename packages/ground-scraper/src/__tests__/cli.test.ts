import { describe, expect, it } from "vitest";
import { run } from "../cli";
import { GroundAvailabilitySchema, SourceInfoSchema } from "../types";

interface CaptureRun {
  code: number;
  out: string[];
  err: string[];
}

async function exec(argv: string[]): Promise<CaptureRun> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run({
    argv,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    now: () => new Date("2026-05-20T09:00:00.000Z"),
  });
  return { code, out, err };
}

function lastJson<T>(r: CaptureRun): T {
  const last = r.out[r.out.length - 1];
  if (!last) throw new Error("no output");
  return JSON.parse(last) as T;
}

describe("mound-ground-scraper CLI", () => {
  describe("--help / 引数なしのとき", () => {
    it("ヘルプを出して exit 0", async () => {
      const r1 = await exec([]);
      expect(r1.code).toBe(0);
      expect(r1.out.join("\n")).toContain("mound-ground-scraper");

      const r2 = await exec(["--help"]);
      expect(r2.code).toBe(0);
      expect(r2.out.join("\n")).toContain("mound-ground-scraper");
    });
  });

  describe("--version --json のとき", () => {
    it("{ version } を返す", async () => {
      const r = await exec(["--version", "--json"]);
      expect(r.code).toBe(0);
      expect(lastJson<{ version: string }>(r).version).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    });
  });

  describe("--list-sources --json のとき", () => {
    it("実装/未実装の adapter を schema 通り出す", async () => {
      const r = await exec(["--list-sources", "--json"]);
      expect(r.code).toBe(0);
      const list = lastJson<unknown[]>(r);
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) {
        expect(SourceInfoSchema.safeParse(s).success).toBe(true);
      }
      const ids = (list as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain("mock");
      expect(ids).toContain("yokohama");
    });
  });

  describe("--source mock --date YYYY-MM-DD のとき", () => {
    it("配列を返し、各要素が GroundAvailability schema を満たす", async () => {
      const r = await exec([
        "--source",
        "mock",
        "--date",
        "2026-06-01",
        "--json",
      ]);
      expect(r.code).toBe(0);
      const rows = lastJson<unknown[]>(r);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(GroundAvailabilitySchema.safeParse(row).success).toBe(true);
      }
    });

    it("text モードは表 (○/×) を出力する", async () => {
      const r = await exec(["--source", "mock", "--date", "2026-06-01"]);
      expect(r.code).toBe(0);
      const text = r.out.join("\n");
      // 少なくとも 1 つのスロットマーカが含まれる
      expect(/[○×]/.test(text)).toBe(true);
    });
  });

  describe("--source yokohama --date YYYY-MM-DD のとき (未実装)", () => {
    it("exit 3 + 構造化エラー JSON (not_implemented: true)", async () => {
      const r = await exec([
        "--source",
        "yokohama",
        "--date",
        "2026-06-01",
        "--json",
      ]);
      expect(r.code).toBe(3);
      const errLast = r.err[r.err.length - 1];
      const j = JSON.parse(errLast as string) as {
        ok: boolean;
        not_implemented: boolean;
        source: string;
      };
      expect(j.ok).toBe(false);
      expect(j.not_implemented).toBe(true);
      expect(j.source).toBe("yokohama");
    });
  });

  describe("バリデーションエラーのとき", () => {
    it("--source 未指定で exit 2", async () => {
      const r = await exec(["--date", "2026-06-01", "--json"]);
      expect(r.code).toBe(2);
      const j = JSON.parse(r.err[r.err.length - 1] as string) as {
        ok: boolean;
        error: string;
      };
      expect(j.ok).toBe(false);
      expect(j.error).toContain("--source");
    });

    it("--date 形式不正で exit 2", async () => {
      const r = await exec(["--source", "mock", "--date", "06/01", "--json"]);
      expect(r.code).toBe(2);
    });

    it("未知の source で exit 2", async () => {
      const r = await exec([
        "--source",
        "unknown",
        "--date",
        "2026-06-01",
        "--json",
      ]);
      expect(r.code).toBe(2);
    });
  });
});
