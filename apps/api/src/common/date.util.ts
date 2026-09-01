const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function differenceInCalendarDays(later: Date, earlier: Date): number {
  const laterUtc = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const earlierUtc = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.round((laterUtc - earlierUtc) / MS_PER_DAY);
}

/** Today's date at UTC midnight — matches how `@db.Date` columns store/compare dates elsewhere in this codebase. */
export function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** The wall-clock "HH:mm" for `date` in IANA zone `timeZone` — e.g. for comparing against a hotel's check-in/check-out policy time. */
export function localTimeHHmm(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
