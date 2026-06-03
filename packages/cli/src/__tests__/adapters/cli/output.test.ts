// --output text|json|tsv|csv の整形テスト。
import { describe, expect, it } from "vitest";
import {
  type OutputSink,
  type RenderOptions,
  emit,
  renderDelimited,
} from "../../../adapters/cli/output";

function capture(): { sink: OutputSink; out: () => string } {
  const lines: string[] = [];
  return {
    sink: {
      write: (l) => {
        lines.push(l);
      },
    },
    out: () => lines.join(""),
  };
}

const opts = (
  format: RenderOptions["format"],
  sink: OutputSink,
): RenderOptions => ({
  format,
  json: format === "json",
  sink,
});

describe("renderDelimited", () => {
  describe("オブジェクト配列を tsv にするとき", () => {
    it("先頭レコードのキーをヘッダにし、タブ区切りで並べる", () => {
      const rows = [
        { id: "g1", title: "練習", n: 9 },
        { id: "g2", title: "本番", n: 12 },
      ];
      expect(renderDelimited(rows, "\t")).toBe(
        ["id\ttitle\tn", "g1\t練習\t9", "g2\t本番\t12"].join("\n"),
      );
    });
  });

  describe("csv でカンマ/引用符を含むとき", () => {
    it("RFC4180 風に quote/エスケープする", () => {
      const rows = [{ name: "a,b", note: 'he said "hi"' }];
      expect(renderDelimited(rows, ",")).toBe(
        ["name,note", '"a,b","he said ""hi"""'].join("\n"),
      );
    });
  });

  describe("ネストした値とスカラーのとき", () => {
    it("セルは JSON 文字列に、スカラーは value 列になる", () => {
      expect(renderDelimited([{ a: { x: 1 }, b: null }], "\t")).toBe(
        ["a\tb", '{"x":1}\t'].join("\n"),
      );
      expect(renderDelimited(42, "\t")).toBe(["value", "42"].join("\n"));
    });
  });

  describe("空配列のとき", () => {
    it("空文字を返す", () => {
      expect(renderDelimited([], ",")).toBe("");
    });
  });
});

describe("emit の format 切替", () => {
  const value = [{ id: "x", v: 1 }];
  it("text は渡したテキストをそのまま出す", () => {
    const c = capture();
    emit(value, "ヒト向けテキスト", opts("text", c.sink));
    expect(c.out()).toBe("ヒト向けテキスト");
  });
  it("json は JSON を出す", () => {
    const c = capture();
    emit(value, "x", opts("json", c.sink));
    expect(c.out()).toBe(JSON.stringify(value));
  });
  it("csv は表を出す", () => {
    const c = capture();
    emit(value, "x", opts("csv", c.sink));
    expect(c.out()).toBe(["id,v", "x,1"].join("\n"));
  });
});
