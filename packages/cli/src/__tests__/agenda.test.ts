import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../adapters/cli/cli";
import { type DbClient, migrate, openDb } from "../adapters/libsql/client";

interface Agenda {
  needs_publish: Array<{ id: string; title: string }>;
  collecting: Array<{
    game: { id: string; title: string };
    rsvp: { available: number };
    ready_to_confirm: boolean;
    shortage: number;
  }>;
  upcoming: Array<{ game: { id: string }; days_until: number }>;
  needs_completion: Array<{ id: string }>;
  needs_settlement: Array<{ id: string }>;
}

interface Harness {
  db: DbClient;
  outputs: string[];
  exec(line: string): Promise<number>;
  setNow(d: Date): void;
  lastJson<T>(): T;
}

function buildHarness(): Harness {
  const outputs: string[] = [];
  const db = openDb({ url: ":memory:" });
  let counter = 0;
  const ids = () => {
    counter += 1;
    return `id-${counter.toString().padStart(4, "0")}`;
  };
  let frozenNow = new Date("2026-05-20T09:00:00.000Z");
  const exec = (line: string) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    tokens.push("--json");
    return run({
      argv: tokens,
      env: {},
      stdout: { write: (l) => outputs.push(l) },
      stderr: { write: () => {} },
      db,
      now: () => frozenNow,
      newId: ids,
    });
  };
  return {
    db,
    outputs,
    exec,
    setNow(d: Date) {
      frozenNow = d;
    },
    lastJson<T>(): T {
      const last = outputs[outputs.length - 1];
      if (!last) throw new Error("no output");
      return JSON.parse(last) as T;
    },
  };
}

describe("mound agenda", () => {
  let h: Harness;
  let teamId: string;

  beforeEach(async () => {
    h = buildHarness();
    await migrate(h.db);
    await h.exec("team create --name Mound");
    teamId = h.lastJson<{ id: string }>().id;
    for (let i = 0; i < 12; i++) {
      await h.exec(`member add --team ${teamId} --name メンバー${i}`);
    }
  });

  describe("DRAFT のままの試合があるとき", () => {
    it("needs_publish に並ぶ", async () => {
      await h.exec(
        `game create --team ${teamId} --title 公開忘れ --date 2026-06-15`,
      );
      await h.exec(`agenda --team ${teamId}`);
      const agenda = h.lastJson<Agenda>();
      expect(agenda.needs_publish.length).toBe(1);
      expect(agenda.needs_publish[0]?.title).toBe("公開忘れ");
    });
  });

  describe("COLLECTING で人数集まっているとき", () => {
    it("ready_to_confirm=true で並ぶ", async () => {
      await h.exec(
        `game create --team ${teamId} --title 締切前 --date 2026-06-15 --min-players 9`,
      );
      const gameId = h.lastJson<{ id: string }>().id;
      await h.exec(`game transition ${gameId} --to COLLECTING`);

      await h.exec(`member list --team ${teamId}`);
      const members = h.lastJson<Array<{ id: string }>>();
      for (let i = 0; i < 9; i++) {
        await h.exec(
          `rsvp set --game ${gameId} --member ${members[i]?.id} --response AVAILABLE`,
        );
      }

      await h.exec(`agenda --team ${teamId}`);
      const agenda = h.lastJson<Agenda>();
      expect(agenda.collecting.length).toBe(1);
      expect(agenda.collecting[0]?.ready_to_confirm).toBe(true);
      expect(agenda.collecting[0]?.shortage).toBe(0);
    });

    it("人数不足のとき shortage を返す", async () => {
      await h.exec(
        `game create --team ${teamId} --title 集まってない --min-players 9`,
      );
      const gameId = h.lastJson<{ id: string }>().id;
      await h.exec(`game transition ${gameId} --to COLLECTING`);
      await h.exec(`agenda --team ${teamId}`);
      const agenda = h.lastJson<Agenda>();
      expect(agenda.collecting[0]?.shortage).toBe(9);
      expect(agenda.collecting[0]?.ready_to_confirm).toBe(false);
    });
  });

  describe("CONFIRMED の試合があるとき", () => {
    it("試合日が horizon 内なら upcoming に並ぶ", async () => {
      h.setNow(new Date("2026-05-20T09:00:00.000Z"));
      await h.exec(
        `game create --team ${teamId} --title 今週開催 --date 2026-05-23 --min-players 1`,
      );
      const gameId = h.lastJson<{ id: string }>().id;
      await h.exec(`game transition ${gameId} --to COLLECTING`);
      await h.exec(`member list --team ${teamId}`);
      const members = h.lastJson<Array<{ id: string }>>();
      await h.exec(
        `rsvp set --game ${gameId} --member ${members[0]?.id} --response AVAILABLE`,
      );
      await h.exec(`game transition ${gameId} --to CONFIRMED`);

      await h.exec(`agenda --team ${teamId} --horizon-days 7`);
      const agenda = h.lastJson<Agenda>();
      expect(agenda.upcoming.length).toBe(1);
      expect(agenda.upcoming[0]?.days_until).toBe(3);
    });

    it("試合日を過ぎていれば needs_completion に並ぶ", async () => {
      h.setNow(new Date("2026-05-20T09:00:00.000Z"));
      await h.exec(
        `game create --team ${teamId} --title 完了忘れ --date 2026-05-19 --min-players 1`,
      );
      const gameId = h.lastJson<{ id: string }>().id;
      await h.exec(`game transition ${gameId} --to COLLECTING`);
      await h.exec(`member list --team ${teamId}`);
      const members = h.lastJson<Array<{ id: string }>>();
      await h.exec(
        `rsvp set --game ${gameId} --member ${members[0]?.id} --response AVAILABLE`,
      );
      await h.exec(`game transition ${gameId} --to CONFIRMED`);

      await h.exec(`agenda --team ${teamId}`);
      const agenda = h.lastJson<Agenda>();
      expect(agenda.needs_completion.length).toBe(1);
      expect(agenda.upcoming.length).toBe(0);
    });
  });
});
