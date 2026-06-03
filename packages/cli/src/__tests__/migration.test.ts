// スキーマ版の管理が PRAGMA user_version の "書き込み" に依存しないことを確かめる。
// Turso (sqld) は PRAGMA user_version 書き込みを禁止するため、schema_meta テーブルで管理する。
import { describe, expect, it } from "vitest";
import {
  ensureSchemaUpToDate,
  migrate,
  openDb,
  readSchemaVersion,
} from "../adapters/libsql/client";
import { SCHEMA_VERSION } from "../adapters/libsql/schema";

describe("schema migration", () => {
  describe("migrate したとき", () => {
    it("schema_meta に版を記録し、PRAGMA user_version は書かない", async () => {
      const db = openDb({ url: ":memory:" });
      await migrate(db);

      expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
      const r = await db.execute(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'",
      );
      expect(Number(r.rows[0]?.value)).toBe(SCHEMA_VERSION);

      // PRAGMA user_version は書いていない (= Turso でも弾かれない)。
      const p = await db.execute("PRAGMA user_version");
      expect(Number(p.rows[0]?.user_version)).toBe(0);
      db.close();
    });
  });

  describe("2 回 migrate したとき", () => {
    it("冪等 (エラーにならず版は据え置き)", async () => {
      const db = openDb({ url: ":memory:" });
      await migrate(db);
      await migrate(db);
      expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
      db.close();
    });
  });

  describe("schema_meta が無く PRAGMA user_version だけある旧ローカル DB のとき", () => {
    it("PRAGMA フォールバックで版を読む", async () => {
      const db = openDb({ url: ":memory:" });
      await db.execute("PRAGMA user_version = 3");
      expect(await readSchemaVersion(db)).toBe(3);
      db.close();
    });
  });

  describe("ensureSchemaUpToDate", () => {
    it("未マイグレーションの DB を最新スキーマにする", async () => {
      const db = openDb({ url: ":memory:" });
      await ensureSchemaUpToDate(db);
      expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
      db.close();
    });
  });
});
