// CLI を subprocess で起動して Phase 1 ループを最初から最後まで走らせる e2e シナリオ。
// `bun packages/cli/src/index.ts` 経由でソースモード実行する (--compile した bin/mound は
// libsql の native binding を埋め込めず単独動作しないため、CI ではソースモードを使う)。
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const entry = resolve(repoRoot, "packages/cli/src/index.ts");
const bunPath = process.env.BUN_INSTALL
  ? join(process.env.BUN_INSTALL, "bin/bun")
  : "bun";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runMound(
  args: string[],
  env: Record<string, string>,
  opts: { timeout?: number } = {},
): RunResult {
  const r = spawnSync(bunPath, [entry, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf-8",
    timeout: opts.timeout ?? 30000,
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function parseJson<T>(out: string): T {
  const trimmed = out.trim();
  if (!trimmed) throw new Error("empty stdout");
  return JSON.parse(trimmed) as T;
}

describe("e2e: CLI を subprocess で起動する Phase 1 シナリオ", () => {
  let dbDir: string;
  let env: Record<string, string>;

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), "mound-e2e-"));
    env = { MOUND_DB_URL: `file:${join(dbDir, "deep", "mound.db")}` };
  });

  describe("セットアップのとき", () => {
    it("--version で 0 終了する", () => {
      const r = runMound(["--version", "--json"], env);
      expect(r.code).toBe(0);
      expect(parseJson<{ version: string }>(r.stdout).version).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    });

    it("init で DB が作られる (親 dir が存在しなくても通る)", () => {
      const r = runMound(["init", "--json"], env);
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      const file = env.MOUND_DB_URL.slice("file:".length);
      expect(existsSync(file)).toBe(true);
      expect(existsSync(dirname(file))).toBe(true);
    });
  });

  describe("試合希望 → 出欠 → 確定 の Phase 1 ループのとき", () => {
    it("CONFIRMED まで実バイナリで完走する", () => {
      // チーム作成
      const teamR = runMound(
        ["team", "create", "--name", "横浜BB", "--area", "横浜", "--json"],
        env,
      );
      expect(teamR.code).toBe(0);
      const team = parseJson<{ id: string; name: string }>(teamR.stdout);
      expect(team.name).toBe("横浜BB");

      // メンバー 10 人追加
      const memberIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = runMound(
          [
            "member",
            "add",
            "--team",
            team.id,
            "--name",
            `メンバー${i}`,
            "--json",
          ],
          env,
        );
        expect(r.code).toBe(0);
        memberIds.push(parseJson<{ id: string }>(r.stdout).id);
      }
      const listR = runMound(
        ["member", "list", "--team", team.id, "--json"],
        env,
      );
      expect(parseJson<unknown[]>(listR.stdout)).toHaveLength(10);

      // 試合を DRAFT で作成
      const gameR = runMound(
        [
          "game",
          "create",
          "--team",
          team.id,
          "--title",
          "練習試合",
          "--date",
          "2026-06-01",
          "--ground",
          "公園グラウンド",
          "--min-players",
          "9",
          "--json",
        ],
        env,
      );
      expect(gameR.code).toBe(0);
      const game = parseJson<{ id: string; status: string }>(gameR.stdout);
      expect(game.status).toBe("DRAFT");

      // COLLECTING に遷移
      const t1 = runMound(
        ["game", "transition", game.id, "--to", "COLLECTING", "--json"],
        env,
      );
      expect(t1.code).toBe(0);
      expect(parseJson<{ status: string }>(t1.stdout).status).toBe(
        "COLLECTING",
      );

      // 9 人が AVAILABLE で回答
      for (let i = 0; i < 9; i++) {
        const r = runMound(
          [
            "rsvp",
            "set",
            "--game",
            game.id,
            "--member",
            memberIds[i] as string,
            "--response",
            "AVAILABLE",
            "--json",
          ],
          env,
        );
        expect(r.code).toBe(0);
      }
      // 残り 1 人は不参加
      const lastR = runMound(
        [
          "rsvp",
          "set",
          "--game",
          game.id,
          "--member",
          memberIds[9] as string,
          "--response",
          "UNAVAILABLE",
          "--json",
        ],
        env,
      );
      expect(lastR.code).toBe(0);

      // summary 確認
      const sR = runMound(
        ["rsvp", "summary", "--game", game.id, "--json"],
        env,
      );
      const summary = parseJson<{
        available: number;
        unavailable: number;
        no_response: number;
      }>(sR.stdout);
      expect(summary.available).toBe(9);
      expect(summary.unavailable).toBe(1);
      expect(summary.no_response).toBe(0);

      // CONFIRMED に遷移できる
      const t2 = runMound(
        ["game", "transition", game.id, "--to", "CONFIRMED", "--json"],
        env,
      );
      expect(t2.code).toBe(0);
      expect(parseJson<{ status: string }>(t2.stdout).status).toBe("CONFIRMED");

      // agenda が upcoming にこの試合を含む
      const aR = runMound(
        ["agenda", "--team", team.id, "--horizon-days", "60", "--json"],
        env,
      );
      expect(aR.code).toBe(0);
      const agenda = parseJson<{
        upcoming: Array<{ game: { id: string } }>;
      }>(aR.stdout);
      expect(agenda.upcoming.some((u) => u.game.id === game.id)).toBe(true);

      // audit ログに全イベントが残っている
      const auditR = runMound(["audit", "--target", game.id, "--json"], env);
      expect(auditR.code).toBe(0);
      const actions = parseJson<Array<{ action: string }>>(auditR.stdout).map(
        (l) => l.action,
      );
      expect(actions).toContain("GAME_CREATED");
      expect(actions).toContain("GAME_TRANSITION:DRAFT->COLLECTING");
      expect(actions).toContain("GAME_TRANSITION:COLLECTING->CONFIRMED");
    });
  });

  describe("不正な操作のとき", () => {
    it("人数不足で CONFIRMED に直接遷移しようとすると exit 2 + 日本語エラー", () => {
      // 別チームを建てる
      const tR = runMound(
        ["team", "create", "--name", "別チーム", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);

      const gR = runMound(
        [
          "game",
          "create",
          "--team",
          team.id,
          "--title",
          "人数不足の試合",
          "--min-players",
          "9",
          "--json",
        ],
        env,
      );
      const game = parseJson<{ id: string }>(gR.stdout);

      // メンバーは 0 人。COLLECTING に進めてから CONFIRMED を試みる
      runMound(
        ["game", "transition", game.id, "--to", "COLLECTING", "--json"],
        env,
      );
      const r = runMound(
        ["game", "transition", game.id, "--to", "CONFIRMED", "--json"],
        env,
      );
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("最低人数");
    });

    it("不正な状態への遷移は拒否する", () => {
      const tR = runMound(
        ["team", "create", "--name", "テストC", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);
      const gR = runMound(
        ["game", "create", "--team", team.id, "--title", "テスト", "--json"],
        env,
      );
      const game = parseJson<{ id: string }>(gR.stdout);
      const r = runMound(
        ["game", "transition", game.id, "--to", "SETTLED", "--json"],
        env,
      );
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("状態遷移が不正です");
      // エージェント向け: エラー JSON に構造化フィールドが乗る
      const errJson = JSON.parse(r.stderr.trim()) as {
        ok: boolean;
        error: string;
        from: string;
        to: string;
        available_transitions: string[];
      };
      expect(errJson.ok).toBe(false);
      expect(errJson.from).toBe("DRAFT");
      expect(errJson.to).toBe("SETTLED");
      expect(errJson.available_transitions).toEqual(
        expect.arrayContaining(["COLLECTING", "CONFIRMED", "CANCELLED"]),
      );
    });
  });

  describe("エージェントが --help でフラグを把握するとき", () => {
    it("mound game create --help がサブコマンド専用 help を返す", () => {
      const r = runMound(["game", "create", "--help"], env);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("mound game create");
      expect(r.stdout).toContain("--team");
      expect(r.stdout).toContain("--title");
      // グローバル help の環境変数セクションは含まれない
      expect(r.stdout).not.toContain("MOUND_DB_AUTH_TOKEN");
    });

    it("game show --json の出力に available_transitions が載る", () => {
      const tR = runMound(
        ["team", "create", "--name", "HelpテストTeam", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);
      const gR = runMound(
        ["game", "create", "--team", team.id, "--title", "show試合", "--json"],
        env,
      );
      const game = parseJson<{ id: string }>(gR.stdout);
      const r = runMound(["game", "show", game.id, "--json"], env);
      expect(r.code).toBe(0);
      const detail = parseJson<{
        game: { status: string };
        available_transitions: string[];
      }>(r.stdout);
      expect(detail.game.status).toBe("DRAFT");
      expect(detail.available_transitions).toEqual(
        expect.arrayContaining(["COLLECTING", "CONFIRMED", "CANCELLED"]),
      );
    });
  });

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });
});
