// CLI を subprocess で起動して Phase 1 ループを最初から最後まで走らせる e2e シナリオ。
// `bun packages/cli/src/index.ts` 経由でソースモード実行する (--compile した bin/mound は
// libsql の native binding を埋め込めず単独動作しないため、CI ではソースモードを使う)。
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    env = {
      MOUND_DB_URL: `file:${join(dbDir, "deep", "mound.db")}`,
      // 実 HTTP を叩かないよう log-only で起動
      MOUND_NOTIFY_MODE: "log-only",
    };
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

  describe("ground import / list (ground-reservation 連携) のとき", () => {
    it("--file から JSON を取り込み list で読み出せる", () => {
      const payload = {
        schema_version: 1,
        scraped_at: "2026-05-22T18:00:00+09:00",
        regions: [
          {
            region: "yokohama",
            records: [
              {
                region: "yokohama",
                facility_name: "e2eテスト公園",
                date_raw: "令和6年6月1日(土)",
                date_iso: "2026-06-01",
                time_range: "09:00-12:00",
                status: null,
                raw: "\n令和6年6月1日(土) 09:00-12:00 e2eテスト公園",
              },
            ],
            errors: [],
          },
        ],
      };
      const jsonPath = join(dbDir, "ground-import.json");
      writeFileSync(jsonPath, JSON.stringify(payload));

      const importR = runMound(
        ["ground", "import", "--file", jsonPath, "--json"],
        env,
      );
      expect(importR.code).toBe(0);
      const summary = parseJson<{
        total_records: number;
        inserted: number;
        updated: number;
      }>(importR.stdout);
      expect(summary.total_records).toBe(1);
      expect(summary.inserted).toBe(1);

      const listR = runMound(
        ["ground", "list", "--source", "yokohama", "--json"],
        env,
      );
      expect(listR.code).toBe(0);
      const slots = parseJson<
        Array<{ source: string; facility_name: string; first_seen_at: string }>
      >(listR.stdout);
      expect(slots).toHaveLength(1);
      expect(slots[0]?.facility_name).toBe("e2eテスト公園");

      // 2 回目の取り込みは inserted=0 / updated=1 になる (first_seen_at を維持)
      const importR2 = runMound(
        ["ground", "import", "--file", jsonPath, "--json"],
        env,
      );
      expect(importR2.code).toBe(0);
      const summary2 = parseJson<{ inserted: number; updated: number }>(
        importR2.stdout,
      );
      expect(summary2.inserted).toBe(0);
      expect(summary2.updated).toBe(1);
    });

    it("--file も --stdin も無いと exit 2", () => {
      const r = runMound(["ground", "import", "--json"], env);
      expect(r.code).toBe(2);
    });

    it("ground diff が since 閾値で新規 slot だけを返す", () => {
      // 1 回目: 1 件取り込み
      const first = {
        schema_version: 1,
        scraped_at: "2026-05-22T18:00:00+09:00",
        regions: [
          {
            region: "kanagawa",
            records: [
              {
                region: "kanagawa",
                facility_name: "diffテスト球場A",
                date_raw: "2026/06/15",
                date_iso: "2026-06-15",
                time_range: "09:00-13:00",
                status: "空き",
                raw: "\n2026/06/15 09:00-13:00 空き diffテスト球場A",
              },
            ],
            errors: [],
          },
        ],
      };
      const path1 = join(dbDir, "diff-1.json");
      writeFileSync(path1, JSON.stringify(first));
      const r1 = runMound(["ground", "import", "--file", path1, "--json"], env);
      expect(r1.code).toBe(0);
      // 取り込み直後を記録 (since の比較用)
      const importedAt = parseJson<{ scraped_at: string }>(r1.stdout);
      expect(importedAt).toBeDefined();

      // 2 回目: 同じ slot + 新規 1 件
      const second = JSON.parse(JSON.stringify(first));
      second.scraped_at = "2026-05-23T18:00:00+09:00";
      second.regions[0].records.push({
        region: "kanagawa",
        facility_name: "diffテスト球場B (新顔)",
        date_raw: "2026/06/22",
        date_iso: "2026-06-22",
        time_range: "13:00-17:00",
        status: "空き",
        raw: "\n2026/06/22 13:00-17:00 空き diffテスト球場B (新顔)",
      });
      const path2 = join(dbDir, "diff-2.json");
      writeFileSync(path2, JSON.stringify(second));
      const r2 = runMound(["ground", "import", "--file", path2, "--json"], env);
      expect(r2.code).toBe(0);

      // 1970 を since にすると全件 (2 件) 返る
      const allR = runMound(
        [
          "ground",
          "diff",
          "--since",
          "1970-01-01T00:00:00Z",
          "--source",
          "kanagawa",
          "--json",
        ],
        env,
      );
      expect(allR.code).toBe(0);
      const all = parseJson<{ count: number; slots: unknown[] }>(allR.stdout);
      expect(all.count).toBe(2);

      // 直近 1 分の since にすると新顔 1 件だけ
      const recentR = runMound(
        [
          "ground",
          "diff",
          "--minutes",
          "1",
          "--source",
          "kanagawa",
          "--game-date",
          "2026-06-22",
          "--json",
        ],
        env,
      );
      expect(recentR.code).toBe(0);
      const recent = parseJson<{
        count: number;
        slots: Array<{ facility_name: string }>;
      }>(recentR.stdout);
      expect(recent.count).toBe(1);
      expect(recent.slots[0]?.facility_name).toBe("diffテスト球場B (新顔)");
    });

    it("ground diff の --since と --minutes は同時指定で exit 2", () => {
      const r = runMound(
        [
          "ground",
          "diff",
          "--since",
          "2026-01-01T00:00:00Z",
          "--minutes",
          "60",
          "--json",
        ],
        env,
      );
      expect(r.code).toBe(2);
    });

    it("ground sync が --bin で渡したスクリプトの出力を取り込む", () => {
      const mockBin = join(dbDir, "fake-ground-monitoring.sh");
      const payload = {
        schema_version: 1,
        scraped_at: "2026-05-23T18:00:00+09:00",
        regions: [
          {
            region: "yokohama",
            records: [
              {
                region: "yokohama",
                facility_name: "syncテスト公園",
                date_raw: "令和8年7月1日(日)",
                date_iso: "2026-07-01",
                time_range: "09:00-12:00",
                status: null,
                raw: "\n令和8年7月1日(日) 09:00-12:00 syncテスト公園",
              },
            ],
            errors: [],
          },
        ],
      };
      writeFileSync(
        mockBin,
        `#!/usr/bin/env bash
cat <<'JSON'
${JSON.stringify(payload)}
JSON
`,
        { mode: 0o755 },
      );

      const r = runMound(
        ["ground", "sync", "--region", "yokohama", "--bin", mockBin, "--json"],
        env,
      );
      expect(r.code).toBe(0);
      const out = parseJson<{
        total_records: number;
        inserted: number;
        new_slots: Array<{ facility_name: string }>;
      }>(r.stdout);
      expect(out.total_records).toBe(1);
      expect(out.inserted).toBe(1);
      expect(
        out.new_slots.some((s) => s.facility_name === "syncテスト公園"),
      ).toBe(true);
    });

    it("ground sync が exit non-zero のスクリプトでは exit 1", () => {
      const mockBin = join(dbDir, "fake-ground-monitoring-fail.sh");
      writeFileSync(
        mockBin,
        '#!/usr/bin/env bash\necho "scraper failed" >&2\nexit 3\n',
        { mode: 0o755 },
      );
      const r = runMound(["ground", "sync", "--bin", mockBin, "--json"], env);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("exit 3");
    });

    it("ground sync --notify --team で新規 slot が log-only sender に流れる", () => {
      const tR = runMound(
        ["team", "create", "--name", "sync 通知テスト", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);
      runMound(
        [
          "notify",
          "add",
          "--team",
          team.id,
          "--kind",
          "DISCORD",
          "--webhook",
          "https://discord.com/api/webhooks/dummy",
          "--json",
        ],
        env,
      );

      const mockBin = join(dbDir, "fake-ground-monitoring-notify.sh");
      const payload = {
        schema_version: 1,
        scraped_at: "2026-05-24T18:00:00+09:00",
        regions: [
          {
            region: "kanagawa",
            records: [
              {
                region: "kanagawa",
                facility_name: "通知トリガ球場",
                date_raw: "2026/08/10",
                date_iso: "2026-08-10",
                time_range: "13:00-17:00",
                status: "空き",
                raw: "\n2026/08/10 13:00-17:00 空き 通知トリガ球場",
              },
            ],
            errors: [],
          },
        ],
      };
      writeFileSync(
        mockBin,
        `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify(payload)}\nJSON\n`,
        { mode: 0o755 },
      );

      const r = runMound(
        [
          "ground",
          "sync",
          "--region",
          "kanagawa",
          "--bin",
          mockBin,
          "--notify",
          "--team",
          team.id,
          "--json",
        ],
        env,
      );
      expect(r.code).toBe(0);
      const out = parseJson<{
        new_slots: unknown[];
        notifications: Array<{ ok: boolean }>;
      }>(r.stdout);
      expect(out.new_slots.length).toBeGreaterThan(0);
      expect(out.notifications.length).toBe(1);
      expect(out.notifications[0]?.ok).toBe(true);
      expect(r.stderr).toContain("[notify:DISCORD]");
      expect(r.stderr).toContain("通知トリガ球場");
    });

    it("ground sync --notify には --team が必要 (exit 2)", () => {
      const r = runMound(
        ["ground", "sync", "--notify", "--bin", "/bin/true", "--json"],
        env,
      );
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("--team");
    });
  });

  describe("notify チャネル管理のとき", () => {
    it("add / list / remove のひと通りができる", () => {
      const tR = runMound(
        ["team", "create", "--name", "通知テスト", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);

      const addR = runMound(
        [
          "notify",
          "add",
          "--team",
          team.id,
          "--kind",
          "DISCORD",
          "--webhook",
          "https://discord.com/api/webhooks/dummy",
          "--label",
          "main",
          "--json",
        ],
        env,
      );
      expect(addR.code).toBe(0);
      const channel = parseJson<{ id: string; enabled: boolean }>(addR.stdout);
      expect(channel.enabled).toBe(true);

      const listR = runMound(
        ["notify", "list", "--team", team.id, "--json"],
        env,
      );
      expect(listR.code).toBe(0);
      expect(parseJson<unknown[]>(listR.stdout)).toHaveLength(1);

      // log-only モードなのでテスト送信は ok=true で返るはず
      const testR = runMound(
        ["notify", "test", channel.id, "--message", "hello", "--json"],
        env,
      );
      expect(testR.code).toBe(0);
      const result = parseJson<{ ok: boolean; channel_kind: string }>(
        testR.stdout,
      );
      expect(result.ok).toBe(true);
      expect(result.channel_kind).toBe("DISCORD");
      // log-only sender が stderr に書き出すので mound からのテスト通知が乗る
      expect(testR.stderr).toContain("[notify:DISCORD]");

      const removeR = runMound(["notify", "remove", channel.id, "--json"], env);
      expect(removeR.code).toBe(0);
      expect(parseJson<{ ok: boolean }>(removeR.stdout).ok).toBe(true);

      const list2R = runMound(
        ["notify", "list", "--team", team.id, "--json"],
        env,
      );
      expect(parseJson<unknown[]>(list2R.stdout)).toEqual([]);
    });

    it("game transition 後に log-only sender が stderr に書き出す", () => {
      const tR = runMound(
        ["team", "create", "--name", "遷移通知テスト", "--json"],
        env,
      );
      const team = parseJson<{ id: string }>(tR.stdout);
      runMound(
        [
          "notify",
          "add",
          "--team",
          team.id,
          "--kind",
          "SLACK",
          "--webhook",
          "https://hooks.slack.com/services/dummy",
          "--json",
        ],
        env,
      );
      const gR = runMound(
        [
          "game",
          "create",
          "--team",
          team.id,
          "--title",
          "遷移通知の試合",
          "--json",
        ],
        env,
      );
      const game = parseJson<{ id: string }>(gR.stdout);
      const tx = runMound(
        ["game", "transition", game.id, "--to", "COLLECTING", "--json"],
        env,
      );
      expect(tx.code).toBe(0);
      // sender が log-only → stderr に "[notify:SLACK]" + DRAFT → COLLECTING が出るはず
      expect(tx.stderr).toContain("[notify:SLACK]");
      expect(tx.stderr).toContain("DRAFT → COLLECTING");
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
