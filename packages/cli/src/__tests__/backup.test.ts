// export / import を実 libSQL (in-memory) で往復させ、別 DB に復元できることを確かめる。
import { describe, expect, it } from "vitest";
import { migrate, openDb } from "../adapters/libsql/client";
import { buildRepositories } from "../adapters/libsql/repositories";
import type { Member, Team } from "../domain/types";

function team(): Team {
  return {
    id: "t1",
    name: "Xeros",
    home_area: "横浜",
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
  };
}

function member(): Member {
  return {
    id: "m1",
    team_id: "t1",
    name: "トミー",
    email: null,
    role: "MEMBER",
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
  };
}

describe("backup export/import", () => {
  describe("別 DB へ書き出して取り込んだとき", () => {
    it("teams と members が復元される", async () => {
      const src = openDb({ url: ":memory:" });
      await migrate(src);
      const srcRepo = buildRepositories(src);
      await srcRepo.teams.insert(team());
      await srcRepo.members.insert(member());

      const rows = await srcRepo.backup.exportAll();
      expect(rows.some((r) => r.table === "teams")).toBe(true);
      expect(rows.some((r) => r.table === "members")).toBe(true);

      const dst = openDb({ url: ":memory:" });
      await migrate(dst);
      const dstRepo = buildRepositories(dst);
      const imported = await dstRepo.backup.importAll(rows);
      expect(imported).toBe(rows.length);

      const t = await dstRepo.teams.get("t1");
      expect(t?.name).toBe("Xeros");
      expect(t?.home_area).toBe("横浜");
      const m = await dstRepo.members.get("m1");
      expect(m?.name).toBe("トミー");

      src.close();
      dst.close();
    });
  });

  describe("同じデータを二度取り込んだとき", () => {
    it("冪等 (INSERT OR REPLACE) で重複しない", async () => {
      const src = openDb({ url: ":memory:" });
      await migrate(src);
      const srcRepo = buildRepositories(src);
      await srcRepo.teams.insert(team());
      const rows = await srcRepo.backup.exportAll();

      const dst = openDb({ url: ":memory:" });
      await migrate(dst);
      const dstRepo = buildRepositories(dst);
      await dstRepo.backup.importAll(rows);
      await dstRepo.backup.importAll(rows);

      const teams = await dstRepo.teams.list();
      expect(teams.filter((t) => t.id === "t1")).toHaveLength(1);

      src.close();
      dst.close();
    });
  });

  describe("未知テーブル / 不正な列名の行のとき", () => {
    it("安全にスキップする", async () => {
      const dst = openDb({ url: ":memory:" });
      await migrate(dst);
      const dstRepo = buildRepositories(dst);
      const imported = await dstRepo.backup.importAll([
        { table: "evil; DROP TABLE teams", data: { id: "x" } },
        { table: "teams", data: { "id) VALUES ('x'); --": "x" } },
      ]);
      expect(imported).toBe(0);
      // teams テーブルは無事
      expect(await dstRepo.teams.list()).toEqual([]);
      dst.close();
    });
  });
});
