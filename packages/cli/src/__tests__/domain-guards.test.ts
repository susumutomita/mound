import { describe, expect, it } from "vitest";
import {
  DomainInvariantError,
  assertGameStatus,
  assertMemberRole,
  assertRsvpResponse,
  isGameStatus,
  isMemberRole,
  isRsvpResponse,
} from "../domain/guards";

describe("type guards", () => {
  describe("isGameStatus のとき", () => {
    it("既知の状態値で true", () => {
      expect(isGameStatus("DRAFT")).toBe(true);
      expect(isGameStatus("CONFIRMED")).toBe(true);
    });

    it("未知の値で false", () => {
      expect(isGameStatus("UNKNOWN")).toBe(false);
      expect(isGameStatus(undefined)).toBe(false);
      expect(isGameStatus(null)).toBe(false);
      expect(isGameStatus(42)).toBe(false);
    });
  });

  describe("assertGameStatus のとき", () => {
    it("既知値はそのまま返す", () => {
      expect(assertGameStatus("DRAFT")).toBe("DRAFT");
    });

    it("不正値で DomainInvariantError", () => {
      expect(() => assertGameStatus("OOPS")).toThrow(DomainInvariantError);
    });
  });

  describe("isRsvpResponse のとき", () => {
    it("AVAILABLE/UNAVAILABLE/MAYBE/NO_RESPONSE で true、それ以外で false", () => {
      expect(isRsvpResponse("AVAILABLE")).toBe(true);
      expect(isRsvpResponse("MAYBE")).toBe(true);
      expect(isRsvpResponse("MAYBE_LATER")).toBe(false);
    });
  });

  describe("assertRsvpResponse のとき", () => {
    it("不正値で DomainInvariantError", () => {
      expect(() => assertRsvpResponse("idk")).toThrow(DomainInvariantError);
    });
  });

  describe("isMemberRole のとき", () => {
    it("ADMIN/MEMBER で true", () => {
      expect(isMemberRole("ADMIN")).toBe(true);
      expect(isMemberRole("MEMBER")).toBe(true);
      expect(isMemberRole("ROOT")).toBe(false);
    });
  });

  describe("assertMemberRole のとき", () => {
    it("不正値で DomainInvariantError", () => {
      expect(() => assertMemberRole("ROOT")).toThrow(DomainInvariantError);
    });
  });
});
