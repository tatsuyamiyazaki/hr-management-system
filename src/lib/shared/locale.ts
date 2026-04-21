/**
 * Phase 1 locale/timezone defaults (Req 20.14)
 */

export const PHASE1_LOCALE = 'ja-JP' as const
export const PHASE1_TIMEZONE = 'Asia/Tokyo' as const

export function formatDateJapanese(date: Date): string {
  return new Intl.DateTimeFormat(PHASE1_LOCALE, {
    timeZone: PHASE1_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
