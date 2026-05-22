// Mock adapter: ネットワークを叩かず、決定論的なダミーデータを返す。
// 用途:
//   - mound 本体側 (将来の ingest コマンド) が安定した shape で結合テストできる
//   - スクレイパ未実装サイトのフォールバック
import type { GroundAvailability } from "../types";
import { SCHEMA_VERSION } from "../types";

export interface MockOptions {
  date: string; // YYYY-MM-DD
  groundId?: string;
  now: Date;
}

// 5 つの定型グラウンド × 4 つの定型タイムスロット。
// available は (groundId + slot) の hash で決定論的にバラつかせる。
const GROUNDS: Array<{ id: string; name: string; area: string }> = [
  { id: "mock:港北:岸根", name: "岸根公園球技場 (mock)", area: "港北区" },
  { id: "mock:港北:綱島", name: "綱島公園野球場 (mock)", area: "港北区" },
  {
    id: "mock:神奈川:三ツ沢",
    name: "三ツ沢公園球技場 (mock)",
    area: "神奈川区",
  },
  { id: "mock:鶴見:鶴見川", name: "鶴見川河川敷 (mock)", area: "鶴見区" },
  { id: "mock:磯子:磯子球場", name: "磯子球場 (mock)", area: "磯子区" },
];

const SLOT_TIMES: Array<{ start: string; end: string; price: number }> = [
  { start: "09:00", end: "12:00", price: 3000 },
  { start: "12:00", end: "15:00", price: 3000 },
  { start: "15:00", end: "18:00", price: 3500 },
  { start: "18:00", end: "21:00", price: 4000 },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function listMockGrounds(): Array<{
  id: string;
  name: string;
  area: string;
}> {
  return GROUNDS.slice();
}

export function scrapeMock(opts: MockOptions): GroundAvailability[] {
  const targets = opts.groundId
    ? GROUNDS.filter((g) => g.id === opts.groundId)
    : GROUNDS;
  if (targets.length === 0) {
    throw new Error(`mock adapter: 該当 ground が無い: ${opts.groundId}`);
  }
  const scrapedAt = opts.now.toISOString();
  return targets.map((g) => ({
    schema_version: SCHEMA_VERSION as 1,
    scraped_at: scrapedAt,
    source: "mock",
    ground: {
      id: g.id,
      name: g.name,
      area: g.area,
      url: null,
    },
    date: opts.date,
    slots: SLOT_TIMES.map((t) => {
      const available = hash(`${g.id}|${opts.date}|${t.start}`) % 3 !== 0;
      return {
        start: t.start,
        end: t.end,
        available,
        reservation_key: `${g.id}|${opts.date}|${t.start}`,
        price_yen: t.price,
        note: null,
      };
    }),
  }));
}
