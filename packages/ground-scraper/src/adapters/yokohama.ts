// 横浜市 公共施設予約システム adapter (stub)。
// 実 URL: https://yoyaku.city.yokohama.lg.jp/
//
// 現状はネットワーク・認証実装を持たず、呼ばれたら NotYetImplementedError を投げる。
// 構造化エラーで返すことで、上位の CLI 層が exit code と JSON を整える。
//
// 将来の実装方針:
//   - 認証不要のページ (予約状況一覧) を fetch して HTML パース
//   - 必要なら playwright で reCAPTCHA バイパス … は ToS 違反になり得るので
//     ガイドラインを確認してから着手する。
//   - 出力 shape は src/types.ts の GroundAvailability に必ず揃える

import { NotYetImplementedError } from "../errors";
import type { GroundAvailability } from "../types";

export interface YokohamaOptions {
  date: string; // YYYY-MM-DD
  area?: string;
  now: Date;
}

export function scrapeYokohama(_opts: YokohamaOptions): GroundAvailability[] {
  throw new NotYetImplementedError(
    "yokohama",
    "横浜市予約システムのスクレイピングはまだ実装されていない (--source mock で代用してください)",
  );
}
