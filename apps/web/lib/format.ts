/** "14:00" -> "2:00 PM" */
export function formatTime12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * The wall-clock "HH:mm" for `date` in IANA zone `timeZone` — a client-side
 * estimate for early check-in/late checkout UI hints; the server (using its
 * own clock) is the actual authority on whether a fee applies.
 */
export function localTimeHHmm(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** Today's date ("YYYY-MM-DD") as it currently is in `timeZone` — the hotel's business day, not the browser's local one. */
export function todayInTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
