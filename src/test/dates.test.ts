import { describe, expect, it } from "vitest";
import { isIsoDate } from "../lib/dates";

describe("isIsoDate", () => {
  it.each(["2026-01-31", "2026-04-30", "2024-02-29", "2000-02-29"])("accepts %s", (date) => {
    expect(isIsoDate(date)).toBe(true);
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "1900-02-29",
    "2026-00-10",
    "2026-13-10",
    "2026-01-00",
    "2026-01-32",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
    "",
    null,
    undefined,
    20260101,
  ])("rejects %s", (date) => {
    expect(isIsoDate(date)).toBe(false);
  });
});
