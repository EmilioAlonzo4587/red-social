const RELATIVE_TIME = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 3600 * 1000 },
  { unit: "month", ms: 30 * 24 * 3600 * 1000 },
  { unit: "week", ms: 7 * 24 * 3600 * 1000 },
  { unit: "day", ms: 24 * 3600 * 1000 },
  { unit: "hour", ms: 3600 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

/** "hace 2 horas", "ayer", "hace 3 días"... (createdAt de Post viene en ISO UTC). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return RELATIVE_TIME.format(Math.round(diffMs / ms), unit);
    }
  }
  return RELATIVE_TIME.format(0, "second");
}
