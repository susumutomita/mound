import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../adapters/cli/cli";
import { type DbClient, migrate, openDb } from "../adapters/libsql/client";

interface Capture {
  out: string[];
  err: string[];
}

function createCapture(): Capture {
  return { out: [], err: [] };
}

interface Harness {
  capture: Capture;
  db: DbClient;
  nextId: () => string;
  exec(line: string, opts?: { json?: boolean }): Promise<number>;
  lastJson<T>(): T;
  outText(): string;
  errText(): string;
}

function buildHarness(): Harness {
  const capture = createCapture();
  const db = openDb({ url: ":memory:" });
  let counter = 0;
  const ids = () => {
    counter += 1;
    return `id-${counter.toString().padStart(4, "0")}`;
  };
  const frozenNow = new Date("2026-05-20T09:00:00.000Z");
  const exec = async (line: string, opts: { json?: boolean } = {}) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (opts.json !== false) tokens.push("--json");
    const code = await run({
      argv: tokens,
      env: {},
      stdout: { write: (l) => capture.out.push(l) },
      stderr: { write: (l) => capture.err.push(l) },
      db,
      now: () => frozenNow,
      newId: ids,
    });
    return code;
  };
  return {
    capture,
    db,
    nextId: ids,
    exec,
    lastJson<T>() {
      const last = capture.out[capture.out.length - 1];
      if (!last) throw new Error("no output");
      return JSON.parse(last) as T;
    },
    outText() {
      return capture.out.join("\n");
    },
    errText() {
      return capture.err.join("\n");
    },
  };
}

describe("Phase 1 ユースケース (CLI)", () => {
  let h: Harness;

  beforeEach(async () => {
    h = buildHarness();
    await migrate(h.db);
  });

  describe("試合希望 → 出欠 → 確定 の一連の流れのとき", () => {
    it("DRAFT → COLLECTING → CONFIRMED まで CLI で完走できる", async () => {
      expect(await h.exec("team create --name Mound --area 横浜")).toBe(0);
      const team = h.lastJson<{ id: string }>();

      for (let i = 0; i < 10; i++) {
        expect(
          await h.exec(`member add --team ${team.id} --name メンバー${i}`),
        ).toBe(0);
      }
      const membersResult = await h.exec(`member list --team ${team.id}`);
      expect(membersResult).toBe(0);
      const members = h.lastJson<Array<{ id: string }>>();
      expect(members.length).toBe(10);

      expect(
        await h.exec(
          `game create --team ${team.id} --title 練習試合 --date 2026-06-01 --min-players 9`,
        ),
      ).toBe(0);
      const game = h.lastJson<{ id: string; status: string }>();
      expect(game.status).toBe("DRAFT");

      expect(await h.exec(`game transition ${game.id} --to COLLECTING`)).toBe(
        0,
      );

      for (let i = 0; i < 9; i++) {
        expect(
          await h.exec(
            `rsvp set --game ${game.id} --member ${members[i]?.id} --response AVAILABLE`,
          ),
        ).toBe(0);
      }

      const summaryExit = await h.exec(`rsvp summary --game ${game.id}`);
      expect(summaryExit).toBe(0);
      expect(h.lastJson<{ available: number }>().available).toBe(9);

      expect(await h.exec(`game transition ${game.id} --to CONFIRMED`)).toBe(0);
      expect(h.lastJson<{ status: string }>().status).toBe("CONFIRMED");
    });

    it("最低人数に満たないとき CONFIRMED への遷移を拒否する", async () => {
      expect(await h.exec("team create --name Mound")).toBe(0);
      const team = h.lastJson<{ id: string }>();
      for (let i = 0; i < 9; i++) {
        await h.exec(`member add --team ${team.id} --name メンバー${i}`);
      }
      const membersExit = await h.exec(`member list --team ${team.id}`);
      expect(membersExit).toBe(0);
      const members = h.lastJson<Array<{ id: string }>>();

      await h.exec(
        `game create --team ${team.id} --title 練習試合 --min-players 9`,
      );
      const game = h.lastJson<{ id: string }>();

      await h.exec(`game transition ${game.id} --to COLLECTING`);
      for (let i = 0; i < 5; i++) {
        await h.exec(
          `rsvp set --game ${game.id} --member ${members[i]?.id} --response AVAILABLE`,
        );
      }
      const code = await h.exec(`game transition ${game.id} --to CONFIRMED`);
      expect(code).toBe(2);
      expect(h.errText()).toContain("最低人数");
    });
  });

  describe("監査ログのとき", () => {
    it("チーム作成・メンバー追加・試合作成・遷移が記録される", async () => {
      await h.exec("team create --name Mound");
      const team = h.lastJson<{ id: string }>();
      await h.exec(
        `game create --team ${team.id} --title 練習試合 --min-players 9`,
      );
      const game = h.lastJson<{ id: string }>();
      await h.exec(`game transition ${game.id} --to CANCELLED`);

      const exit = await h.exec(`audit --target ${game.id}`);
      expect(exit).toBe(0);
      const logs = h.lastJson<Array<{ action: string }>>();
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("GAME_CREATED");
      expect(actions).toContain("GAME_TRANSITION:DRAFT->CANCELLED");
    });
  });

  describe("RSVP upsert のとき", () => {
    it("同じメンバーの再回答は上書きされる", async () => {
      await h.exec("team create --name Mound");
      const team = h.lastJson<{ id: string }>();
      await h.exec(`member add --team ${team.id} --name 山田`);
      const member = h.lastJson<{ id: string }>();
      await h.exec(`game create --team ${team.id} --title 練習試合`);
      const game = h.lastJson<{ id: string }>();

      await h.exec(
        `rsvp set --game ${game.id} --member ${member.id} --response MAYBE`,
      );
      await h.exec(
        `rsvp set --game ${game.id} --member ${member.id} --response AVAILABLE`,
      );

      await h.exec(`rsvp list --game ${game.id}`);
      const list = h.lastJson<Array<{ response: string }>>();
      expect(list.length).toBe(1);
      expect(list[0]?.response).toBe("AVAILABLE");
    });
  });
});
