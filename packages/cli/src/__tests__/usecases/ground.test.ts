import { describe, expect, it } from "vitest";
import type { GroundSlot } from "../../domain/types";
import type {
  GroundSlotFilter,
  GroundSlotRepository,
  Repositories,
  UseCaseContext,
} from "../../ports";
import {
  ScrapeOutputSchema,
  importGroundAvailability,
  listGroundSlots,
} from "../../usecases/ground";

function fakeRepo(): {
  store: Map<string, GroundSlot>;
  repo: GroundSlotRepository;
} {
  const store = new Map<string, GroundSlot>();
  const repo: GroundSlotRepository = {
    upsert: async (s) => {
      store.set(s.slot_key, s);
      return s;
    },
    list: async (filter: GroundSlotFilter) =>
      Array.from(store.values()).filter(
        (s) =>
          (!filter.source || s.source === filter.source) &&
          (!filter.dateIso || s.date_iso === filter.dateIso),
      ),
    getByKey: async (k) => store.get(k) ?? null,
  };
  return { store, repo };
}

function buildCtx(opts: { now: Date; idSeed?: number }): {
  ctx: UseCaseContext;
  store: Map<string, GroundSlot>;
} {
  const { store, repo: groundSlots } = fakeRepo();
  // 他 repository は本テストでは使わないのでダミー実装で型を満たすだけ。
  const stub = new Proxy({}, { get: () => async () => null }) as never;
  const repo: Repositories = {
    teams: stub,
    members: stub,
    games: stub,
    rsvps: stub,
    audit: stub,
    groundSlots,
  };
  let seed = opts.idSeed ?? 0;
  return {
    store,
    ctx: {
      repo,
      now: () => opts.now,
      newId: () => `gs-${++seed}`,
    },
  };
}

const SAMPLE_PAYLOAD = {
  schema_version: 1,
  scraped_at: "2026-05-22T18:00:00+09:00",
  regions: [
    {
      region: "yokohama",
      records: [
        {
          region: "yokohama",
          facility_name: "こども自然公園",
          date_raw: "令和5年11月24日(金)",
          date_iso: "2023-11-24",
          time_range: "19:00-21:00",
          status: null,
          raw: "\n令和5年11月24日(金) 19:00～21:00 こども自然公園",
        },
      ],
      errors: [],
    },
    {
      region: "kanagawa",
      records: [
        {
          region: "kanagawa",
          facility_name: "サーティーフォー保土ケ谷球場",
          date_raw: "2026/06/15",
          date_iso: "2026-06-15",
          time_range: "09:00-13:00",
          status: "空き",
          raw: "\n2026/06/15 09:00～13:00 空き サーティーフォー保土ケ谷球場",
        },
      ],
      errors: ["network: timeout (sample)"],
    },
  ],
};

describe("ScrapeOutputSchema", () => {
  describe("ground-reservation の出力 shape を受け付けるとき", () => {
    it("有効な payload は parse できる", () => {
      const parsed = ScrapeOutputSchema.safeParse(SAMPLE_PAYLOAD);
      expect(parsed.success).toBe(true);
    });

    it("schema_version が欠けていると弾く", () => {
      const { schema_version: _drop, ...rest } = SAMPLE_PAYLOAD;
      expect(ScrapeOutputSchema.safeParse(rest).success).toBe(false);
    });
  });
});

describe("importGroundAvailability use case", () => {
  describe("初回取り込みのとき", () => {
    it("全 record を新規挿入し inserted カウントが上がる", async () => {
      const { ctx, store } = buildCtx({
        now: new Date("2026-05-22T10:00:00Z"),
      });
      const result = await importGroundAvailability(ctx, SAMPLE_PAYLOAD);
      expect(result.total_records).toBe(2);
      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
      expect(store.size).toBe(2);
    });

    it("regions_with_errors に errors を含む region が乗る", async () => {
      const { ctx } = buildCtx({ now: new Date("2026-05-22T10:00:00Z") });
      const result = await importGroundAvailability(ctx, SAMPLE_PAYLOAD);
      expect(result.regions_with_errors).toHaveLength(1);
      expect(result.regions_with_errors[0]?.region).toBe("kanagawa");
    });

    it("slot_key が source|facility|date|time で組まれる", async () => {
      const { ctx, store } = buildCtx({
        now: new Date("2026-05-22T10:00:00Z"),
      });
      await importGroundAvailability(ctx, SAMPLE_PAYLOAD);
      expect(store.has("yokohama|こども自然公園|2023-11-24|19:00-21:00")).toBe(
        true,
      );
      expect(
        store.has(
          "kanagawa|サーティーフォー保土ケ谷球場|2026-06-15|09:00-13:00",
        ),
      ).toBe(true);
    });
  });

  describe("2 回目の取り込みのとき", () => {
    it("既存行は first_seen_at を保ち ingested_at を更新する", async () => {
      const firstNow = new Date("2026-05-22T10:00:00Z");
      const secondNow = new Date("2026-05-23T10:00:00Z");

      const ctx1 = buildCtx({ now: firstNow });
      await importGroundAvailability(ctx1.ctx, SAMPLE_PAYLOAD);
      const beforeFirstSeen = ctx1.store.get(
        "yokohama|こども自然公園|2023-11-24|19:00-21:00",
      )?.first_seen_at;
      expect(beforeFirstSeen).toBe(firstNow.toISOString());

      // 同じ store を引き継ぐためコピー経由で 2 回目を回す。
      const store = ctx1.store;
      const ctx2: UseCaseContext = {
        ...ctx1.ctx,
        now: () => secondNow,
      };
      const result = await importGroundAvailability(ctx2, SAMPLE_PAYLOAD);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(2);

      const after = store.get("yokohama|こども自然公園|2023-11-24|19:00-21:00");
      expect(after?.first_seen_at).toBe(firstNow.toISOString());
      expect(after?.ingested_at).toBe(secondNow.toISOString());
    });
  });

  describe("payload が壊れているとき", () => {
    it("zod の ZodError が伝播する", async () => {
      const { ctx } = buildCtx({ now: new Date("2026-05-22T10:00:00Z") });
      await expect(
        importGroundAvailability(ctx, { not: "valid" }),
      ).rejects.toThrow();
    });
  });
});

describe("listGroundSlots use case", () => {
  describe("source / date でフィルタするとき", () => {
    it("条件に合うものだけ返す", async () => {
      const { ctx } = buildCtx({ now: new Date("2026-05-22T10:00:00Z") });
      await importGroundAvailability(ctx, SAMPLE_PAYLOAD);

      const onlyYokohama = await listGroundSlots(ctx, { source: "yokohama" });
      expect(onlyYokohama).toHaveLength(1);
      expect(onlyYokohama[0]?.source).toBe("yokohama");

      const onlyDate = await listGroundSlots(ctx, { dateIso: "2026-06-15" });
      expect(onlyDate).toHaveLength(1);
      expect(onlyDate[0]?.facility_name).toBe("サーティーフォー保土ケ谷球場");

      const none = await listGroundSlots(ctx, { dateIso: "2099-01-01" });
      expect(none).toEqual([]);
    });
  });
});
