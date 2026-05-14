export function ymdInKarachi(d: Date): string {
  // Asia/Karachi is fixed UTC+5 (no DST).
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseTimeOfDay(hhmm: string): { hours: number; minutes: number } {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(hhmm)
  if (!m) throw new Error(`bad time of day: ${hhmm}`)
  return { hours: Number(m[1]), minutes: Number(m[2]) }
}

export function dateAtKarachiTime(ymd: string, hhmm: string): Date {
  const { hours, minutes } = parseTimeOfDay(hhmm)
  // ymd is treated as Karachi local; subtract 5h to get UTC.
  const utcMillis = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
    hours,
    minutes,
  ) - 5 * 60 * 60 * 1000
  return new Date(utcMillis)
}

export function hhmmKarachi(d: Date): string {
  // Asia/Karachi is fixed UTC+5 (no DST).
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const h = String(shifted.getUTCHours()).padStart(2, '0')
  const m = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function karachiDayShort(ymd: string): string {
  // ymd like "2026-05-13" → "Wed 13 May" (Karachi-local, no Intl).
  const y = Number(ymd.slice(0, 4))
  const mo = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  // ymd is Karachi-local midnight; the UTC instant that maps to that Karachi
  // moment is midnight-UTC minus 5h. Add 5h back to read Karachi-local fields.
  const utc = new Date(Date.UTC(y, mo - 1, d) - 5 * 60 * 60 * 1000)
  const k = new Date(utc.getTime() + 5 * 60 * 60 * 1000)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${weekdays[k.getUTCDay()]} ${k.getUTCDate()} ${months[k.getUTCMonth()]}`
}
