import { describe, expect, it } from "vitest";
import {
  canTransition,
  checkGuard,
  getAvailableTransitions,
} from "../domain/state-machine";
import type { RsvpSummary } from "../domain/types";

function createRsvpSummary(overrides?: Partial<RsvpSummary>): RsvpSummary {
  return {
    available: 0,
    unavailable: 0,
    maybe: 0,
    no_response: 0,
    ...overrides,
  };
}

describe("canTransition", () => {
  describe("DRAFT からのとき", () => {
    it("COLLECTING / CONFIRMED / CANCELLED を許可する", () => {
      expect(canTransition("DRAFT", "COLLECTING")).toBe(true);
      expect(canTransition("DRAFT", "CONFIRMED")).toBe(true);
      expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    });

    it("COMPLETED や SETTLED への直接遷移は拒否する", () => {
      expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
      expect(canTransition("DRAFT", "SETTLED")).toBe(false);
    });
  });

  describe("終端状態のとき", () => {
    it("CANCELLED からはどこにも遷移できない", () => {
      expect(getAvailableTransitions("CANCELLED")).toEqual([]);
    });

    it("SETTLED からはどこにも遷移できない", () => {
      expect(getAvailableTransitions("SETTLED")).toEqual([]);
    });
  });
});

describe("checkGuard", () => {
  describe("COLLECTING → CONFIRMED のとき", () => {
    it("参加可が最低人数以上なら許可する", () => {
      const result = checkGuard("COLLECTING", "CONFIRMED", {
        rsvp: createRsvpSummary({ available: 9 }),
        minPlayers: 9,
        gameDate: "2026-06-01",
        now: new Date("2026-05-20"),
      });
      expect(result.allowed).toBe(true);
    });

    it("参加可が最低人数に満たないとき拒否する", () => {
      const result = checkGuard("COLLECTING", "CONFIRMED", {
        rsvp: createRsvpSummary({ available: 5 }),
        minPlayers: 9,
        gameDate: "2026-06-01",
        now: new Date("2026-05-20"),
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("最低人数");
    });
  });

  describe("CONFIRMED → COMPLETED のとき", () => {
    it("試合日が過ぎていれば許可する", () => {
      const result = checkGuard("CONFIRMED", "COMPLETED", {
        rsvp: createRsvpSummary({ available: 9 }),
        minPlayers: 9,
        gameDate: "2026-05-19",
        now: new Date("2026-05-20T10:00:00Z"),
      });
      expect(result.allowed).toBe(true);
    });

    it("試合日が未到来なら拒否する", () => {
      const result = checkGuard("CONFIRMED", "COMPLETED", {
        rsvp: createRsvpSummary({ available: 9 }),
        minPlayers: 9,
        gameDate: "2026-06-01",
        now: new Date("2026-05-20"),
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("試合日");
    });
  });

  describe("不正な遷移のとき", () => {
    it("理由を返して拒否する", () => {
      const result = checkGuard("DRAFT", "SETTLED", {
        rsvp: createRsvpSummary(),
        minPlayers: 9,
        gameDate: null,
        now: new Date(),
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("DRAFT → SETTLED");
    });
  });
});
