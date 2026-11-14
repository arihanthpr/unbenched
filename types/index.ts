export type Sport = 'volleyball' | 'basketball' | 'soccer' | 'badminton' | 'football' | 'baseball' | 'tennis' | 'lacrosse' | 'softball' | 'cricket'

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'all-welcome'

export interface Game {
  id: string
  title: string
  sport: Sport
  location: string
  /** Street address of the location (from lib/parks.ts or a Mapbox result). */
  locationAddress?: string
  meetingSpot?: string
  lat: number
  lng: number
  date: string
  time: string
  maxPlayers: number
  currentPlayers: number
  hostIncluded?: boolean   // does the host occupy a maxPlayers slot? (default true)
  skillLevel: SkillLevel
  /**
   * When set, this game is visible and joinable ONLY to members of that
   * group, enforced in Firestore rules, not just in the UI. null/absent means
   * a normal public game.
   */
  groupId?: string | null
  description: string
  hostId: string
  hostName: string
  createdAt: string
  rsvpIds: string[]
  rsvpNames?: string[]
  players?: string[]
  lastMessageAt?: string | null
  lastMessageText?: string | null
  lastMessageSenderName?: string | null
  lastMessageSenderId?: string | null
  status?: string
  // Who can see/join this game. Absent = 'public' (legacy games stay public).
  visibility?: 'public' | 'friends' | 'invite' | 'group'
  // For 'invite' games: the uids specifically invited (host always included).
  invitedUsers?: string[]
}

export interface City {
  name: string
  lng: number
  lat: number
  /**
   * State/province, when the city came from a search. Display only, it exists
   * because "Fremont" alone is five different towns, and a picker that shows
   * five identical rows is how accounts ended up saved to Union City, New
   * Jersey and Concord, New Hampshire. Optional: legacy saved cities have none.
   */
  region?: string
}

/**
 * The shareable part of a profile, at publicProfiles/{uid}. Everything other
 * players may see, and nothing else: no email, phone, date of birth, parent
 * contact, tokens, block lists or game history. Written by the owner (see
 * syncPublicProfile in lib/firestore.ts); `banned` only by the Admin SDK.
 */
export interface PublicProfile {
  uid: string
  displayName: string
  displayNameLower: string
  photoURL: string | null
  bio: string
  skillLevel: SkillLevel
  sportPreferences: Sport[]
  createdAt: string
  updatedAt?: string
  banned?: boolean
}

export interface UserProfile {
  uid: string
  displayName: string
  // Lowercased displayName for case-insensitive search in the player directory.
  displayNameLower?: string
  email: string
  phoneNumber: string | null
  phoneVerified: boolean
  emailVerified: boolean
  sportPreferences: Sport[]
  skillLevel: SkillLevel
  age: number | null
  parentConsent: boolean
  gamesAttended: string[]
  gamesHosted: string[]
  reportedBy: string[]
  blockedUsers: string[]
  city?: City
  bio?: string
  photoURL?: string
  banned?: boolean
  createdAt: string
  dateOfBirth?: string
  parentEmail?: string | null
  parentPhone?: string | null
  isMinor?: boolean
  requiresParentConsent?: boolean
  phoneVerifiedAt?: string
  // emailVerifyCode / emailVerifyExpiry deliberately absent: the verification
  // code is issued and checked by app/api/email-verify, which stores only a
  // scrypt hash at users/{uid}/private/secure. They used to live here, on a
  // document readable by every signed-in account.
  resetCode?: string | null
  resetCodeExpiry?: number | null
  sportSkills?: Record<string, string>
  // Per-game last-read timestamp (ISO) for chat unread tracking, keyed by gameId.
  lastRead?: Record<string, string>
  // Game chats the user has muted (no unread badges in the inbox).
  mutedChats?: string[]
  // FCM device tokens for push notifications (one per device/browser).
  fcmTokens?: string[]
  /**
   * Groups this user belongs to. Denormalised onto the user doc so Firestore
   * rules can authorise group-only games with ONE get() per request, instead of
   * one per document (which would blow the 20-lookup limit on a list query).
   */
  groupIds?: string[]
  /** Group chats the user has muted. */
  mutedGroupChats?: string[]
  // Set once the first-time push prompt in a group chat has been shown and
  // acted on (enabled or dismissed), so it never appears again for this user.
  hasSeenPushPrompt?: boolean
  parentName?: string | null
  /**
   * Notification preferences. Absent means "never chosen", which resolves to
   * on, see lib/emailPrefs, which is the only thing that should read these.
   *
   * emailReminders is the LEGACY key: it used to gate new-game and
   * friend-request email too, so it remains the fallback for the two keys
   * below. It now literally means reminder emails and nothing else.
   */
  settings?: {
    emailNewGames?: boolean
    emailFriendRequests?: boolean
    emailCancellations?: boolean
    emailReminders?: boolean
  }
}

export interface RSVP {
  gameId: string
  userId: string
  userName: string
  createdAt: string
}

export interface Message {
  id: string
  userId: string
  userName: string
  text: string
  createdAt: string
  // Emoji → list of uids who reacted with it. Keys with 0 uids are removed.
  reactions?: Record<string, string[]>
  // Soft delete: content hidden in the UI but the doc stays for history.
  deleted?: boolean
}

export const SPORT_CONFIG: Record<
  Sport,
  { label: string; color: string; bg: string; textColor: string }
> = {
  volleyball:  { label: 'Volleyball',  color: '#2563EB', bg: '#EFF6FF', textColor: '#1D4ED8' },
  basketball:  { label: 'Basketball',  color: '#FF5C00', bg: '#FFF1E5', textColor: '#E85100' },
  soccer:      { label: 'Soccer',      color: '#16A34A', bg: '#F0FDF4', textColor: '#15803D' },
  badminton:   { label: 'Badminton',   color: '#7C3AED', bg: '#F5F3FF', textColor: '#6D28D9' },
  football:    { label: 'Football',    color: '#FF5C00', bg: '#FFF1E5', textColor: '#E85100' },
  baseball:    { label: 'Baseball',    color: '#0891B2', bg: '#ECFEFF', textColor: '#0E7490' },
  tennis:      { label: 'Tennis',      color: '#0D9488', bg: '#F0FDFA', textColor: '#0F766E' },
  lacrosse:    { label: 'Lacrosse',    color: '#B45309', bg: '#FFFBEB', textColor: '#92400E' },
  softball:    { label: 'Softball',    color: '#65A30D', bg: '#F7FEE7', textColor: '#4D7C0F' },
  cricket:     { label: 'Cricket',     color: '#B91C1C', bg: '#FEF2F2', textColor: '#991B1B' },
}

export type SportStyle = (typeof SPORT_CONFIG)[Sport]

/** Neutral styling for a sport we don't recognise. */
const SPORT_FALLBACK: SportStyle = {
  label: 'Game', color: '#6B7280', bg: '#F3F4F6', textColor: '#4B5563',
}

/**
 * Safe accessor for SPORT_CONFIG, same failure class as skillStyle().
 *
 * Every call site reads .bg / .label / .color straight off the lookup, so one
 * game document with an unexpected sport value returns undefined and throws,
 * taking the whole list down rather than degrading that one card. Firestore rows
 * carry no runtime types, so a legacy value, a hand-edited doc, or a sport
 * shipped server-side ahead of the client all produce this.
 *
 * hasOwnProperty rather than a plain lookup with `?? fallback`: keys like
 * 'constructor' and 'toString' resolve to truthy values off Object.prototype, so
 * the fallback would never fire and the caller would read .bg off a function.
 */
export function sportStyle(sport: Sport | string | null | undefined): SportStyle {
  if (typeof sport !== 'string' || sport === '') return SPORT_FALLBACK
  if (!Object.prototype.hasOwnProperty.call(SPORT_CONFIG, sport)) return SPORT_FALLBACK
  return (SPORT_CONFIG as Record<string, SportStyle>)[sport]
}

/** True when `sport` is one of the known Sport values. */
export function isKnownSport(sport: unknown): sport is Sport {
  return typeof sport === 'string' && Object.prototype.hasOwnProperty.call(SPORT_CONFIG, sport)
}

export const SKILL_CONFIG: Record<
  SkillLevel,
  { label: string; color: string; bg: string; textColor: string }
> = {
  beginner:     { label: 'Beginner',     color: '#16A34A', bg: '#F0FDF4', textColor: '#15803D' },
  intermediate: { label: 'Intermediate', color: '#D97706', bg: '#FFFBEB', textColor: '#B45309' },
  advanced:     { label: 'Advanced',     color: '#DC2626', bg: '#FEF2F2', textColor: '#B91C1C' },
  'all-welcome':{ label: 'All Welcome',  color: '#2563EB', bg: '#EFF6FF', textColor: '#1D4ED8' },
}

export type SkillStyle = (typeof SKILL_CONFIG)[SkillLevel]

/** Neutral grey styling for a skill level we don't recognise. */
const SKILL_FALLBACK: SkillStyle = {
  label: 'All Levels', color: '#6B7280', bg: '#F3F4F6', textColor: '#4B5563',
}

/**
 * Safe accessor for SKILL_CONFIG.
 *
 * Indexing the record directly returns undefined for any value outside the four
 * known levels, and every call site immediately reads .bg / .label off it, so a
 * single game document with an unexpected skillLevel threw
 * "undefined is not an object (evaluating 'skill.bg')" and took down the whole
 * games list, not just that one card. Firestore documents are not typed at
 * runtime: legacy rows, a hand-edited doc, or a future value shipped ahead of
 * the client can all produce one. Degrade to a neutral badge instead.
 */
export function skillStyle(level: SkillLevel | string | null | undefined): SkillStyle {
  if (typeof level !== 'string' || level === '') return SKILL_FALLBACK
  // hasOwnProperty, not a plain lookup: 'constructor' / 'toString' resolve to
  // truthy values off Object.prototype, so `?? fallback` would not fire and the
  // caller would still read .bg off a function. Own-key check closes that.
  if (!Object.prototype.hasOwnProperty.call(SKILL_CONFIG, level)) return SKILL_FALLBACK
  return (SKILL_CONFIG as Record<string, SkillStyle>)[level]
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export type GroupRole = 'admin' | 'member'
export type JoinRequestStatus = 'pending' | 'accepted' | 'declined'

export interface Group {
  id: string
  name: string
  description?: string
  /** Lowercased name, for case-insensitive browse/search. */
  nameLower: string
  createdBy: string
  createdAt: string
  /** Every admin. Always a subset of memberIds; never empty. */
  adminIds: string[]
  /** Every member, admins included. */
  memberIds: string[]
  memberCount: number
  photoURL?: string | null
}

export interface GroupJoinRequest {
  id: string
  groupId: string
  groupName: string
  userId: string
  userName: string
  userPhotoURL?: string | null
  status: JoinRequestStatus
  createdAt: string
  /** Set when an admin accepts or declines. */
  decidedBy?: string
  decidedAt?: string
}

/**
 * A channel inside a group.
 *
 * The two defaults, #announcements and #general, are IMPLICIT: they are not
 * stored, they exist for every group by definition (see DEFAULT_CHANNELS in
 * lib/groups.ts). Only channels an admin creates get a document. That means no
 * backfill for groups that predate channels, and no way for a group to end up
 * without the basics because a write failed.
 *
 * `members`, `invites` and `settings` are panels rather than message channels;
 * their ids are reserved so a custom channel can never shadow one.
 */
export interface GroupChannel {
  id: string
  name: string
  /** 'announcement' channels are readable by members but postable by admins only. */
  kind: 'text' | 'announcement'
  createdBy: string
  createdAt: string
}

export interface GroupMessage {
  id: string
  groupId: string
  /** Which channel this message belongs to. */
  channelId: string
  userId: string
  userName: string
  text: string
  createdAt: string
  deleted?: boolean
}
