import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format";

const NOW = new Date("2026-10-28T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("hace menos de un minuto", () => {
    expect(formatRelativeTime("2026-10-28T11:59:30.000Z", NOW)).toBe(
      "ahora",
    );
  });

  it("hace horas", () => {
    expect(formatRelativeTime("2026-10-28T10:00:00.000Z", NOW)).toBe(
      "hace 2 horas",
    );
  });

  it("ayer", () => {
    expect(formatRelativeTime("2026-10-27T12:00:00.000Z", NOW)).toBe("ayer");
  });

  it("hace semanas", () => {
    expect(formatRelativeTime("2026-10-14T12:00:00.000Z", NOW)).toBe(
      "hace 2 semanas",
    );
  });
});
