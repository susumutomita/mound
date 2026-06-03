// mound config (接続先の永続化) のテスト。env > config.json > 既定 の優先順位を確かめる。
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFilePath, readConfig, writeConfig } from "../adapters/config";
import { buildDbConfig } from "../adapters/libsql/client";

let home: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mound-cfg-"));
  env = { HOME: home };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("writeConfig / readConfig", () => {
  describe("保存して読み直したとき", () => {
    it("値が往復し、ファイルは 0600 で書かれる", () => {
      writeConfig(env, {
        db_url: "libsql://xeros.turso.io",
        db_auth_token: "secret-token",
      });
      const cfg = readConfig(env);
      expect(cfg.db_url).toBe("libsql://xeros.turso.io");
      expect(cfg.db_auth_token).toBe("secret-token");
      const mode = statSync(configFilePath(env)).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("一部だけ更新したとき", () => {
    it("既存値を保ったままマージする", () => {
      writeConfig(env, { db_url: "libsql://a.turso.io", db_auth_token: "tok" });
      writeConfig(env, { db_url: "libsql://b.turso.io" });
      const cfg = readConfig(env);
      expect(cfg.db_url).toBe("libsql://b.turso.io");
      expect(cfg.db_auth_token).toBe("tok"); // token は据え置き
    });
  });

  describe("設定ファイルが無いとき", () => {
    it("空設定を返す (throw しない)", () => {
      expect(readConfig(env)).toEqual({});
    });
  });
});

describe("buildDbConfig の優先順位", () => {
  describe("config.json に設定があるとき", () => {
    it("env が無ければ config.json を使う", () => {
      writeConfig(env, {
        db_url: "libsql://xeros.turso.io",
        db_auth_token: "tok",
      });
      const cfg = buildDbConfig(env);
      expect(cfg.url).toBe("libsql://xeros.turso.io");
      expect(cfg.authToken).toBe("tok");
    });
  });

  describe("env と config.json の両方があるとき", () => {
    it("env が優先される", () => {
      writeConfig(env, { db_url: "libsql://from-config.turso.io" });
      const cfg = buildDbConfig({
        ...env,
        MOUND_DB_URL: "libsql://from-env.turso.io",
      });
      expect(cfg.url).toBe("libsql://from-env.turso.io");
    });
  });

  describe("どちらも無いとき", () => {
    it("既定の ~/.mound/mound.db を使う", () => {
      const cfg = buildDbConfig(env);
      expect(cfg.url).toBe(`file:${home}/.mound/mound.db`);
    });
  });
});
