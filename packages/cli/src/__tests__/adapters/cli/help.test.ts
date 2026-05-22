import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../../../adapters/cli/cli";
import { HELP, findCommandHelp } from "../../../adapters/cli/help";
import {
  type DbClient,
  migrate,
  openDb,
} from "../../../adapters/libsql/client";

interface Harness {
  out: string[];
  err: string[];
  db: DbClient;
  exec(argv: string[]): Promise<number>;
}

function buildHarness(): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const db = openDb({ url: ":memory:" });
  return {
    out,
    err,
    db,
    async exec(argv) {
      return run({
        argv,
        env: {},
        stdout: { write: (l) => out.push(l) },
        stderr: { write: (l) => err.push(l) },
        db,
        now: () => new Date("2026-05-20T09:00:00.000Z"),
        newId: () => "id-1",
      });
    },
  };
}

describe("findCommandHelp", () => {
  describe("2-token サブコマンドが一致するとき", () => {
    it("最も具体的な help を返す", () => {
      const h = findCommandHelp(["game", "create"]);
      expect(h).toBeTruthy();
      expect(h).toContain("mound game create");
      expect(h).toContain("--team");
    });
  });

  describe("2-token が無いとき", () => {
    it("1-token にフォールバックする", () => {
      const h = findCommandHelp(["game", "unknown"]);
      expect(h).toBeTruthy();
      expect(h).toContain("mound game");
    });
  });

  describe("どれも一致しないとき", () => {
    it("null を返す", () => {
      expect(findCommandHelp(["totally-unknown"])).toBeNull();
      expect(findCommandHelp([])).toBeNull();
    });
  });
});

describe("CLI --help の dispatch", () => {
  let h: Harness;

  beforeEach(async () => {
    h = buildHarness();
    await migrate(h.db);
  });

  describe("引数なしのとき", () => {
    it("グローバル help を出力する", async () => {
      const code = await h.exec([]);
      expect(code).toBe(0);
      expect(h.out.join("\n")).toContain(
        "mound — 草野球チーム向け試合成立 CLI",
      );
    });
  });

  describe("ルート --help のとき", () => {
    it("グローバル help を出力する", async () => {
      const code = await h.exec(["--help"]);
      expect(code).toBe(0);
      expect(h.out.join("\n")).toBe(HELP);
    });
  });

  describe("サブコマンド --help のとき", () => {
    it("game create のヘルプだけ出力する (グローバルとは異なる)", async () => {
      const code = await h.exec(["game", "create", "--help"]);
      expect(code).toBe(0);
      const text = h.out.join("\n");
      expect(text).toContain("mound game create");
      expect(text).toContain("--team");
      expect(text).toContain("--title");
      // グローバル help の末尾 (環境変数セクション) は載らない
      expect(text).not.toContain("MOUND_DB_AUTH_TOKEN");
    });

    it("game transition のヘルプに状態遷移ガードが書いてある", async () => {
      const code = await h.exec(["game", "transition", "--help"]);
      expect(code).toBe(0);
      const text = h.out.join("\n");
      expect(text).toContain("min_players");
      expect(text).toContain("available_transitions");
    });

    it("rsvp set のヘルプが出る", async () => {
      const code = await h.exec(["rsvp", "set", "--help"]);
      expect(code).toBe(0);
      expect(h.out.join("\n")).toContain("mound rsvp set");
    });

    it("init --help でグローバルではなく init 専用ヘルプ", async () => {
      const code = await h.exec(["init", "--help"]);
      expect(code).toBe(0);
      const text = h.out.join("\n");
      expect(text).toContain("mound init");
      expect(text).toContain("lazy migration");
    });
  });
});
