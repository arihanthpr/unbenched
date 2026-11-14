import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addHours, isAfter, format } from 'date-fns'
import type { Game } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Distance ─────────────────────────────────────────────────────────────────

/**
 * Great-circle distance in miles between two lat/lng points (haversine).
 *
 * Games have always stored `lat`/`lng` and users have always stored a `city`
 * with coordinates, but nothing ever compared them, the games list simply
 * printed "N games near {your city}" over an unfiltered, unsorted list of every
 * game in the database. A game in Fremont would be announced as "near Tracy"
 * purely because Tracy was the reading user's saved city.
 *
 * Returns null rather than a wrong number when either point is missing or
 * non-finite, so callers can distinguish "far away" from "unknown".
 */
export function distanceMiles(
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined,
): number | null {
  if (!a || !b) return null
  const { lat: lat1, lng: lng1 } = a
  const { lat: lat2, lng: lng2 } = b
  if (![lat1, lng1, lat2, lng2].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  // 0,0 is in the Gulf of Guinea; in this dataset it only ever means "unset".
  if ((lat1 === 0 && lng1 === 0) || (lat2 === 0 && lng2 === 0)) return null

  const R = 3958.8 // mean Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Short human label for a distance: "0.4 mi", "3.2 mi", "27 mi". */
export function formatDistance(miles: number | null): string | null {
  if (miles === null || !Number.isFinite(miles)) return null
  if (miles < 0.1) return 'here'
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

// Whole-years age from an ISO date string (YYYY-MM-DD), or null if unparseable.
// Shared by the signup form and the Google onboarding modal.
export function calcAge(dob: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// A game's chat archives 24h after the game time (consistent with the in-chat
// expiry). Archived chats drop out of the inbox and live on the settings page.
export function chatArchiveTime(game: Pick<Game, 'date' | 'time'>): Date {
  try {
    return addHours(new Date(`${game.date}T${game.time}`), 24)
  } catch {
    return addHours(new Date(), 24)
  }
}

export function isChatArchived(game: Pick<Game, 'date' | 'time'>): boolean {
  return isAfter(new Date(), chatArchiveTime(game))
}

// Short "time until kickoff" label for game chats/cards, e.g. "Starts in 2h",
// "Starts in 35m", or "Live now" while the game is underway (its first hour).
// Returns null once the game is well past (>1h after start) or invalid, so
// callers can simply hide the badge.
export function gameStartsInLabel(game: Pick<Game, 'date' | 'time'>): string | null {
  const start = new Date(`${game.date}T${game.time}`).getTime()
  if (Number.isNaN(start)) return null
  const diffMs = start - Date.now()
  const mins = Math.round(diffMs / 60000)

  // Game underway (within the first hour after kickoff).
  if (mins <= 0) return mins > -60 ? 'Live now' : null

  if (mins < 60) return `Starts in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Starts in ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `In ${days}d`
  return null
}

// Absolute "when" label for notification copy, e.g. "Sat, Aug 30 · 6:00 PM".
// Falls back to the raw stored strings rather than throwing, so a malformed
// date can never take down the notification that carries it.
export function gameWhenLabel(game: Pick<Game, 'date' | 'time'>): string {
  try {
    const d = new Date(`${game.date}T${game.time}`)
    if (Number.isNaN(d.getTime())) return `${game.date} at ${game.time}`
    return format(d, 'EEE, MMM d · h:mm a')
  } catch {
    return `${game.date} at ${game.time}`
  }
}

// True when a game is imminent enough to deserve an urgency highlight (kickoff
// within the next 3 hours, or currently live).
export function isGameImminent(game: Pick<Game, 'date' | 'time'>): boolean {
  const start = new Date(`${game.date}T${game.time}`).getTime()
  if (Number.isNaN(start)) return false
  const diffMins = (start - Date.now()) / 60000
  return diffMins <= 180 && diffMins > -60
}
