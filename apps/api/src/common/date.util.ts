const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function differenceInCalendarDays(later: Date, earlier: Date): number {
  const laterUtc = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const earlierUtc = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.round((laterUtc - earlierUtc) / MS_PER_DAY);
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

/**
 * Midnight (UTC-encoded, matching `@db.Date` columns) of whatever calendar
 * date `date` falls on in `timeZone` — e.g. for deciding what "today" means
 * for a hotel's business day rather than the server's own UTC date.
 */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

/** Right now's calendar date (UTC-encoded) in the hotel's own timezone — the business-day "today" for stamping checkInDate/checkOutDate/etc. */
export function todayDateOnlyInTimeZone(timeZone: string): Date {
  return startOfDayInTimeZone(new Date(), timeZone);
}

/** Midnight (UTC-encoded) of the 1st of whatever month `date` falls in, in `timeZone`. */
export function startOfMonthInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, 1));
}
