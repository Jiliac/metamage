// ---------------------------------------------------------------------------
// Display dates from 'YYYY-MM-DD' strings. Parsed by hand, never through
// `Date`, so the server's timezone can't shift the day.
// ---------------------------------------------------------------------------

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] // prettier-ignore

/** 'May 3'. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** 'May 3, 2026'. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] // prettier-ignore

/** The lens window as the eyebrow prints it: 'June 2026' for a whole
 *  calendar month, else 'Jun 1 → Jun 30, 2026'. */
export function windowLabel(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  const lastDay = new Date(Date.UTC(ye, me, 0)).getUTCDate()
  if (ys === ye && ms === me && ds === 1 && de === lastDay) {
    return `${LONG_MONTHS[ms - 1]} ${ys}`
  }
  return `${shortDate(start)} → ${shortDate(end)}, ${ye}`
}
