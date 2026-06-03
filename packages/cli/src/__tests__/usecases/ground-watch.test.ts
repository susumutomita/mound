import { describe, expect, it } from "vitest";
import type { GroundSlot, GroundWatch, Team } from "../../domain/types";
import type {
  GroundWatchRepository,
  Repositories,
  TeamRepository,
  UseCaseContext,
} from "../../ports";
import {
  addGroundWatch,
  filterSlotsByTeamWatches,
  listGroundWatches,
  removeGroundWatch,
  slotMatchesWatch,
} from "../../usecases/ground-watch";

function buildFake(): {
  ctx: UseCaseContext;
  teams: Map<string, Team>;
  watches: Map<string, GroundWatch>;
} {
  const teams = new Map<string, Team>();
  const watches = new Map<string, GroundWatch>();
  const teamRepo: TeamRepository = {
    insert: async (t) => {
      teams.set(t.id, t);
      return t;
    },
    list: async () => Array.from(teams.values()),
    get: async (id) => teams.get(id) ?? null,
    update: async (t) => {
      teams.set(t.id, t);
      return t;
    },
  };
  const watchRepo: GroundWatchRepository = {
    insert: async (w) => {
      watches.set(w.id, w);
      return w;
    },
    list: async (teamId) =>
      Array.from(watches.values()).filter((w) => w.team_id === teamId),
    listEnabled: async (teamId) =>
      Array.from(watches.values()).filter(
        (w) => w.team_id === teamId && w.enabled,
      ),
    get: async (id) => watches.get(id) ?? null,
    remove: async (id) => watches.delete(id),
  };
  const stub = new Proxy({}, { get: () => async () => null }) as never;
  const repo: Repositories = {
    teams: teamRepo,
    members: stub,
    games: stub,
    rsvps: stub,
    audit: stub,
    groundSlots: stub,
    notifications: stub,
    groundWatches: watchRepo,
    observations: stub,
    knowledge: stub,
    settlements: stub,
  };
  let seq = 0;
  const ctx: UseCaseContext = {
    repo,
    notifier: stub,
    now: () => new Date("2026-05-22T10:00:00.000Z"),
    newId: () => `w-${++seq}`,
  };
  return { ctx, teams, watches };
}

function slot(overrides: Partial<GroundSlot>): GroundSlot {
  return {
    id: "s",
    slot_key: "k",
    source: "kanagawa",
    facility_name: "軟式野球場",
    date_iso: "2026-05-30", // Saturday
    date_raw: "2026/05/30",
    time_range: "09:00-12:00",
    status: "空き",
    raw: "",
    scraped_at: "x",
    first_seen_at: "x",
    ingested_at: "x",
    ...overrides,
  };
}

function watch(overrides: Partial<GroundWatch>): GroundWatch {
  return {
    id: "w",
    team_id: "t",
    label: null,
    source: null,
    facility_pattern: null,
    weekdays: null,
    time_from: null,
    time_to: null,
    enabled: true,
    created_at: "x",
    updated_at: "x",
    ...overrides,
  };
}

describe("slotMatchesWatch", () => {
  describe("条件が全部 null のとき", () => {
    it("どんな slot にもマッチする (全通し)", () => {
      expect(slotMatchesWatch(slot({}), watch({}))).toBe(true);
    });
  });

  describe("source が一致しないとき", () => {
    it("マッチしない", () => {
      expect(
        slotMatchesWatch(
          slot({ source: "kanagawa" }),
          watch({ source: "yokohama" }),
        ),
      ).toBe(false);
    });
  });

  describe("facility_pattern が LIKE のとき", () => {
    it("% は任意の文字列にマッチする", () => {
      expect(
        slotMatchesWatch(
          slot({ facility_name: "田端スポーツ公園野球場" }),
          watch({ facility_pattern: "%野球場%" }),
        ),
      ).toBe(true);
    });

    it("接頭辞でも _ でも当たる", () => {
      expect(
        slotMatchesWatch(
          slot({ facility_name: "保土ケ谷球場" }),
          watch({ facility_pattern: "保土ケ谷%" }),
        ),
      ).toBe(true);
      expect(
        slotMatchesWatch(
          slot({ facility_name: "ABCD" }),
          watch({ facility_pattern: "A__D" }),
        ),
      ).toBe(true);
    });

    it("マッチしないものは弾く", () => {
      expect(
        slotMatchesWatch(
          slot({ facility_name: "体育館" }),
          watch({ facility_pattern: "%野球場%" }),
        ),
      ).toBe(false);
    });
  });

  describe("weekdays のとき", () => {
    it("2026-05-30 は土曜なので sat が含まれていれば通る", () => {
      expect(
        slotMatchesWatch(
          slot({ date_iso: "2026-05-30" }),
          watch({ weekdays: "sat,sun" }),
        ),
      ).toBe(true);
    });

    it("2026-05-25 は月曜なので sat,sun だけだと弾かれる", () => {
      expect(
        slotMatchesWatch(
          slot({ date_iso: "2026-05-25" }),
          watch({ weekdays: "sat,sun" }),
        ),
      ).toBe(false);
    });

    it("date_iso が無い slot は weekdays 指定があれば弾く", () => {
      expect(
        slotMatchesWatch(
          slot({ date_iso: null }),
          watch({ weekdays: "sat,sun" }),
        ),
      ).toBe(false);
    });
  });

  describe("time_from / time_to のとき", () => {
    it("time_from <= slot 開始時刻なら通る", () => {
      expect(
        slotMatchesWatch(
          slot({ time_range: "09:00-12:00" }),
          watch({ time_from: "09:00" }),
        ),
      ).toBe(true);
      expect(
        slotMatchesWatch(
          slot({ time_range: "08:00-10:00" }),
          watch({ time_from: "09:00" }),
        ),
      ).toBe(false);
    });

    it("time_to >= slot 終了時刻なら通る", () => {
      expect(
        slotMatchesWatch(
          slot({ time_range: "09:00-12:00" }),
          watch({ time_to: "12:00" }),
        ),
      ).toBe(true);
      expect(
        slotMatchesWatch(
          slot({ time_range: "09:00-13:00" }),
          watch({ time_to: "12:00" }),
        ),
      ).toBe(false);
    });
  });

  describe("複数条件 AND のとき", () => {
    it("全条件を満たさないと弾く", () => {
      expect(
        slotMatchesWatch(
          slot({
            source: "kanagawa",
            facility_name: "軟式野球場",
            date_iso: "2026-05-30",
            time_range: "09:00-12:00",
          }),
          watch({
            source: "kanagawa",
            facility_pattern: "%野球場%",
            weekdays: "sat,sun",
            time_from: "09:00",
            time_to: "12:00",
          }),
        ),
      ).toBe(true);
    });
  });

  describe("enabled=false の watch のとき", () => {
    it("マッチしない", () => {
      expect(slotMatchesWatch(slot({}), watch({ enabled: false }))).toBe(false);
    });
  });
});

describe("filterSlotsByTeamWatches", () => {
  describe("team に watch が 1 つも無いとき", () => {
    it("全 slot を通す (後方互換)", async () => {
      const fake = buildFake();
      await fake.ctx.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      const slots = [slot({ id: "a" }), slot({ id: "b", source: "yokohama" })];
      const result = await filterSlotsByTeamWatches(fake.ctx, "t", slots);
      expect(result).toEqual(slots);
    });
  });

  describe("watch が複数あるとき (OR 評価)", () => {
    it("どれか 1 つに当たれば通す", async () => {
      const fake = buildFake();
      await fake.ctx.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      await addGroundWatch(fake.ctx, {
        teamId: "t",
        label: "kanagawa 軟式",
        source: "kanagawa",
        facilityPattern: "軟式野球場",
        weekdays: null,
        timeFrom: null,
        timeTo: null,
      });
      await addGroundWatch(fake.ctx, {
        teamId: "t",
        label: "yokohama 全部",
        source: "yokohama",
        facilityPattern: null,
        weekdays: null,
        timeFrom: null,
        timeTo: null,
      });

      const result = await filterSlotsByTeamWatches(fake.ctx, "t", [
        slot({ id: "k1", source: "kanagawa", facility_name: "軟式野球場" }),
        slot({ id: "y1", source: "yokohama", facility_name: "こども自然公園" }),
        slot({
          id: "s1",
          source: "samukawa",
          facility_name: "田端スポーツ公園野球場",
        }),
      ]);
      const ids = result.map((s) => s.id).sort();
      expect(ids).toEqual(["k1", "y1"]);
    });
  });

  describe("enabled=false の watch しか無いとき", () => {
    it("listEnabled が空配列なので、後方互換で全 slot を通す", async () => {
      const fake = buildFake();
      await fake.ctx.repo.teams.insert({
        id: "t",
        name: "T",
        home_area: null,
        created_at: "x",
        updated_at: "x",
      });
      const w = await addGroundWatch(fake.ctx, {
        teamId: "t",
        label: null,
        source: "kanagawa",
        facilityPattern: null,
        weekdays: null,
        timeFrom: null,
        timeTo: null,
      });
      // 直接 store を書き換えて enabled を落とす (CRUD update API は無いので)
      const stored = fake.watches.get(w.id);
      if (stored) fake.watches.set(w.id, { ...stored, enabled: false });

      const slots = [slot({ id: "s1" })];
      const result = await filterSlotsByTeamWatches(fake.ctx, "t", slots);
      expect(result).toEqual(slots);
    });
  });
});

describe("addGroundWatch / listGroundWatches / removeGroundWatch", () => {
  it("CRUD のひと通りができる", async () => {
    const fake = buildFake();
    await fake.ctx.repo.teams.insert({
      id: "t",
      name: "T",
      home_area: null,
      created_at: "x",
      updated_at: "x",
    });
    const w = await addGroundWatch(fake.ctx, {
      teamId: "t",
      label: "週末野球場",
      source: null,
      facilityPattern: "%野球場%",
      weekdays: "sat,sun",
      timeFrom: "09:00",
      timeTo: "17:00",
    });
    expect(w.id).toBe("w-1");
    expect(w.enabled).toBe(true);

    const list = await listGroundWatches(fake.ctx, "t");
    expect(list).toHaveLength(1);

    expect(await removeGroundWatch(fake.ctx, w.id)).toBe(true);
    expect(await removeGroundWatch(fake.ctx, w.id)).toBe(false);
    expect(await listGroundWatches(fake.ctx, "t")).toEqual([]);
  });

  it("team が無いと TeamNotFoundError", async () => {
    const fake = buildFake();
    await expect(
      addGroundWatch(fake.ctx, {
        teamId: "ghost",
        label: null,
        source: null,
        facilityPattern: null,
        weekdays: null,
        timeFrom: null,
        timeTo: null,
      }),
    ).rejects.toThrow(/team が存在しません/);
  });
});
