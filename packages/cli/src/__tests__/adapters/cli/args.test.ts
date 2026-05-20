import { describe, expect, it } from "vitest";
import {
  UsageError,
  boolFlag,
  optionalFlag,
  parseArgs,
  requireFlag,
} from "../../../adapters/cli/args";

describe("parseArgs", () => {
  describe("--key value 形式のとき", () => {
    it("値を取り込む", () => {
      const r = parseArgs(["--name", "Mound"]);
      expect(r.flags.name).toBe("Mound");
      expect(r.positional).toEqual([]);
    });
  });

  describe("--key=value 形式のとき", () => {
    it("= 区切りで値を取る", () => {
      const r = parseArgs(["--name=Mound"]);
      expect(r.flags.name).toBe("Mound");
    });

    it("= の右に空文字を渡せる", () => {
      const r = parseArgs(["--note="]);
      expect(r.flags.note).toBe("");
    });
  });

  describe("値を取らないブールフラグのとき", () => {
    it("末尾にあれば true", () => {
      const r = parseArgs(["--json"]);
      expect(r.flags.json).toBe(true);
    });

    it("次が別フラグなら true (--key --next)", () => {
      const r = parseArgs(["--json", "--verbose"]);
      expect(r.flags.json).toBe(true);
      expect(r.flags.verbose).toBe(true);
    });
  });

  describe("positional 引数のとき", () => {
    it("非フラグはすべて positional に積む", () => {
      const r = parseArgs(["team", "create", "--name", "X"]);
      expect(r.positional).toEqual(["team", "create"]);
      expect(r.flags.name).toBe("X");
    });
  });

  describe("requireFlag のとき", () => {
    it("値があれば返す", () => {
      const r = parseArgs(["--name", "Mound"]);
      expect(requireFlag(r.flags, "name")).toBe("Mound");
    });

    it("欠落 / ブール / 空文字なら UsageError", () => {
      const empty = parseArgs([]);
      expect(() => requireFlag(empty.flags, "name")).toThrow(UsageError);

      const bool = parseArgs(["--name"]);
      expect(() => requireFlag(bool.flags, "name")).toThrow(UsageError);

      const blank = parseArgs(["--name="]);
      expect(() => requireFlag(blank.flags, "name")).toThrow(UsageError);
    });
  });

  describe("optionalFlag / boolFlag のとき", () => {
    it("文字列値だけを optionalFlag が返す", () => {
      const r = parseArgs(["--name", "Mound", "--json"]);
      expect(optionalFlag(r.flags, "name")).toBe("Mound");
      expect(optionalFlag(r.flags, "json")).toBe(undefined);
      expect(optionalFlag(r.flags, "missing")).toBe(undefined);
    });

    it('boolFlag は true / "true" 両方を真と扱う', () => {
      const r = parseArgs(["--json"]);
      expect(boolFlag(r.flags, "json")).toBe(true);
      expect(boolFlag({ a: "true" }, "a")).toBe(true);
      expect(boolFlag({ a: "false" }, "a")).toBe(false);
      expect(boolFlag({}, "missing")).toBe(false);
    });
  });
});
