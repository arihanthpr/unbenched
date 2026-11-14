'use client'

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, onSnapshot, arrayUnion, arrayRemove, increment,
  writeBatch, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { sendPushNotification } from './push'
import type { Group, GroupChannel, GroupJoinRequest, GroupMessage } from '@/types'

/**
 * Groups: a named set of players (e.g. "WHS Badminton") with multiple admins,
 * request-to-join membership, its own chat, and the ability to scope a game so
 * only members can see it.
 *
 * Membership lives in two places on purpose:
 *   - groups/{id}.memberIds , the authoritative list, used by the group UI.
 *   - users/{uid}.groupIds  , a mirror, so Firestore rules can authorise a
 *     group-only game with a single get() of the caller's own user document
 *     rather than one get() per game in a list query.
 * Every write that changes membership must update both, which is why they all
 * go through a batch here.
 */

/** Deterministic id so a user can only ever have one open request per group. */
export const joinRequestId = (groupId: string, userId: string) => `${groupId}_${userId}`

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, 'groups', groupId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Group) : null
}

export function subscribeToGroup(groupId: string, cb: (g: Group | null) => void) {
  return onSnapshot(doc(db, 'groups', groupId), (s) =>
    cb(s.exists() ? ({ id: s.id, ...s.data() } as Group) : null))
}

/** Groups the user belongs to. */
export async function getMyGroups(uid: string): Promise<Group[]> {
  const snap = await getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))
}

export function subscribeToMyGroups(uid: string, cb: (groups: Group[]) => void) {
  return onSnapshot(query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))))
}

/** Browse/search all groups. Groups are discoverable by anyone signed in. */
export async function searchGroups(term: string, max = 30): Promise<Group[]> {
  const q = term.trim().toLowerCase()
  if (!q) {
    const snap = await getDocs(query(collection(db, 'groups'), orderBy('memberCount', 'desc'), limit(max)))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))
  }
  // Prefix match on the lowercased name, no composite index needed.
  const snap = await getDocs(query(
    collection(db, 'groups'),
    where('nameLower', '>=', q),
    where('nameLower', '<=', q + ''),
    limit(max),
  ))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))
}

export const isAdmin  = (g: Group | null, uid?: string) => !!uid && !!g?.adminIds?.includes(uid)
export const isMember = (g: Group | null, uid?: string) => !!uid && !!g?.memberIds?.includes(uid)

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createGroup(
  uid: string,
  data: { name: string; description?: string },
): Promise<string> {
  const name = data.name.trim()
  if (!name) throw new Error('name-required')

  const ref = doc(collection(db, 'groups'))
  const batch = writeBatch(db)
  batch.set(ref, {
    name,
    nameLower: name.toLowerCase(),
    description: data.description?.trim() ?? '',
    createdBy: uid,
    createdAt: new Date().toISOString(),
    adminIds: [uid],      // creator is the first admin
    memberIds: [uid],
    memberCount: 1,
    photoURL: null,
  })
  batch.update(doc(db, 'users', uid), { groupIds: arrayUnion(ref.id) })
  await batch.commit()
  return ref.id
}

// ─── Join requests ────────────────────────────────────────────────────────────

export async function requestToJoin(group: Group, uid: string, userName: string, photoURL?: string | null) {
  if (isMember(group, uid)) return
  const id = joinRequestId(group.id, uid)
  const existing = await getDoc(doc(db, 'groupJoinRequests', id))
  // A declined request can be re-sent; a pending one must not be duplicated.
  if (existing.exists() && existing.data().status === 'pending') return

  await setDoc(doc(db, 'groupJoinRequests', id), {
    groupId: group.id,
    groupName: group.name,
    userId: uid,
    userName,
    userPhotoURL: photoURL ?? null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  sendPushNotification({
    scope: { kind: 'group-join-request', groupId: group.id },
    title: group.name,
    body: `${userName} asked to join`,
    url: `/groups/${group.id}?tab=requests`,
  }).catch(() => {})
}

export function subscribeToPendingRequests(groupId: string, cb: (reqs: GroupJoinRequest[]) => void) {
  return onSnapshot(
    query(collection(db, 'groupJoinRequests'), where('groupId', '==', groupId)),
    (snap) => cb(snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as GroupJoinRequest))
      .filter((r) => r.status === 'pending')),
  )
}

/** Live count of pending requests across every group the user administers. */
export function subscribeToMyPendingRequestCount(adminGroupIds: string[], cb: (n: number) => void) {
  if (adminGroupIds.length === 0) { cb(0); return () => {} }
  // `in` supports at most 10 values; admins of more than 10 groups see the
  // badge for the first 10, which is a reasonable ceiling for a badge.
  return onSnapshot(
    query(collection(db, 'groupJoinRequests'), where('groupId', 'in', adminGroupIds.slice(0, 10))),
    (snap) => cb(snap.docs.filter((d) => d.data().status === 'pending').length),
  )
}

export async function respondToJoinRequest(
  req: GroupJoinRequest,
  adminUid: string,
  accept: boolean,
): Promise<void> {
  const reqRef = doc(db, 'groupJoinRequests', req.id)
  const batch = writeBatch(db)

  if (accept) {
    batch.update(doc(db, 'groups', req.groupId), {
      memberIds: arrayUnion(req.userId),
      memberCount: increment(1),
    })
    // Mirror onto the user doc so the rules can authorise group-only games.
    batch.update(doc(db, 'users', req.userId), { groupIds: arrayUnion(req.groupId) })
  }
  batch.update(reqRef, { status: accept ? 'accepted' : 'declined', decidedBy: adminUid, decidedAt: new Date().toISOString() })
  await batch.commit()

  sendPushNotification({
    scope: { kind: 'group-join-response', groupId: req.groupId },
    uids: [req.userId],
    title: req.groupName,
    body: accept ? 'You were added to the group' : 'Your request was declined',
    url: accept ? `/groups/${req.groupId}` : '/groups',
  }).catch(() => {})
}

// ─── Membership changes ───────────────────────────────────────────────────────

export async function leaveGroup(group: Group, uid: string): Promise<void> {
  // The last admin cannot walk out and leave the group unadministered.
  if (isAdmin(group, uid) && group.adminIds.length === 1) throw new Error('last-admin')
  const batch = writeBatch(db)
  batch.update(doc(db, 'groups', group.id), {
    memberIds: arrayRemove(uid),
    adminIds: arrayRemove(uid),
    memberCount: increment(-1),
  })
  batch.update(doc(db, 'users', uid), { groupIds: arrayRemove(group.id) })
  await batch.commit()
  // Drop the stale join request so the user can ask again later.
  await deleteDoc(doc(db, 'groupJoinRequests', joinRequestId(group.id, uid))).catch(() => {})
}

export async function removeMember(group: Group, targetUid: string): Promise<void> {
  if (isAdmin(group, targetUid) && group.adminIds.length === 1) throw new Error('last-admin')
  const batch = writeBatch(db)
  batch.update(doc(db, 'groups', group.id), {
    memberIds: arrayRemove(targetUid),
    adminIds: arrayRemove(targetUid),
    memberCount: increment(-1),
  })
  batch.update(doc(db, 'users', targetUid), { groupIds: arrayRemove(group.id) })
  await batch.commit()
  await deleteDoc(doc(db, 'groupJoinRequests', joinRequestId(group.id, targetUid))).catch(() => {})
}

export async function promoteToAdmin(groupId: string, targetUid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { adminIds: arrayUnion(targetUid) })
}

export async function demoteAdmin(group: Group, targetUid: string): Promise<void> {
  if (group.adminIds.length === 1) throw new Error('last-admin')
  await updateDoc(doc(db, 'groups', group.id), { adminIds: arrayRemove(targetUid) })
}

// ─── Channels ─────────────────────────────────────────────────────────────────

/**
 * Ids that are not custom channels.
 *
 * ANNOUNCEMENTS and GENERAL are the implicit defaults every group has without a
 * document; the rest are panels (roster, join requests, settings) that render
 * beside channels in the list but hold no messages. Reserving all of them stops
 * a custom channel shadowing a built-in route.
 */
export const ANNOUNCEMENTS = 'announcements'
export const GENERAL = 'general'
export const PANEL_IDS = ['members', 'invites', 'settings'] as const
export const RESERVED_CHANNEL_IDS: string[] = [ANNOUNCEMENTS, GENERAL, ...PANEL_IDS]

/** The channels every group has, whether or not anyone created anything. */
export const DEFAULT_CHANNELS: GroupChannel[] = [
  { id: ANNOUNCEMENTS, name: 'announcements', kind: 'announcement', createdBy: '', createdAt: '' },
  { id: GENERAL, name: 'general', kind: 'text', createdBy: '', createdAt: '' },
]

/** Live custom channels for a group, defaults first. */
export function subscribeToChannels(groupId: string, cb: (channels: GroupChannel[]) => void) {
  return onSnapshot(
    query(collection(db, 'groups', groupId, 'channels'), orderBy('createdAt', 'asc')),
    (snap) => cb([
      ...DEFAULT_CHANNELS,
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() } as GroupChannel)),
    ]),
    // A denied/failed read must still leave the group usable.
    () => cb(DEFAULT_CHANNELS),
  )
}

/** Normalises a typed channel name the way Discord does: lowercase, hyphenated. */
export function channelSlug(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
}

export async function createChannel(groupId: string, uid: string, name: string): Promise<string> {
  const slug = channelSlug(name)
  if (!slug) throw new Error('invalid-name')
  if (RESERVED_CHANNEL_IDS.includes(slug)) throw new Error('reserved-name')
  const ref = doc(db, 'groups', groupId, 'channels', slug)
  if ((await getDoc(ref)).exists()) throw new Error('already-exists')
  await setDoc(ref, {
    name: slug, kind: 'text', createdBy: uid, createdAt: new Date().toISOString(),
  })
  return slug
}

export async function deleteChannel(groupId: string, channelId: string): Promise<void> {
  if (RESERVED_CHANNEL_IDS.includes(channelId)) throw new Error('reserved-name')
  await deleteDoc(doc(db, 'groups', groupId, 'channels', channelId))
}

export function subscribeToChannelMessages(
  groupId: string,
  channelId: string,
  cb: (messages: GroupMessage[]) => void,
) {
  return onSnapshot(
    query(
      collection(db, 'groups', groupId, 'channels', channelId, 'messages'),
      orderBy('createdAt', 'asc'), limit(200),
    ),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, groupId, channelId, ...d.data() } as GroupMessage))),
    () => cb([]),
  )
}

/** Only admins may post in an announcement channel; members read it. */
export function canPostIn(channel: GroupChannel | null, group: Group | null, uid?: string): boolean {
  if (!channel || !group || !uid) return false
  if (!isMember(group, uid)) return false
  return channel.kind !== 'announcement' || isAdmin(group, uid)
}

export async function sendGroupMessage(
  group: Group,
  uid: string,
  userName: string,
  text: string,
  channelId: string = GENERAL,
): Promise<void> {
  const body = text.trim()
  if (!body) return
  await addDoc(collection(db, 'groups', group.id, 'channels', channelId, 'messages'), {
    userId: uid, userName, text: body, createdAt: new Date().toISOString(),
  })
  await updateDoc(doc(db, 'groups', group.id), {
    lastMessageAt: new Date().toISOString(),
    lastMessageText: body.slice(0, 120),
    lastMessageSenderId: uid,
  }).catch(() => {})

  // Everyone except the sender; muted members are filtered server-side.
  const recipients = group.memberIds.filter((m) => m !== uid)
  if (recipients.length) {
    sendPushNotification({
      scope: { kind: 'group', groupId: group.id },
      uids: recipients,
      title: group.name,
      body: `${userName}: ${body.slice(0, 80)}`,
      url: `/groups/${group.id}/${channelId}`,
      excludeMutedGroupId: group.id,
    }).catch(() => {})
  }
}

export async function deleteGroupMessage(
  groupId: string, messageId: string, channelId: string = GENERAL,
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'channels', channelId, 'messages', messageId), { deleted: true })
}

// ─── Mute ─────────────────────────────────────────────────────────────────────

export async function setGroupChatMuted(uid: string, groupId: string, muted: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    mutedGroupChats: muted ? arrayUnion(groupId) : arrayRemove(groupId),
  })
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a group and all of its dependent records. Runs server-side (see
 * app/api/groups/delete) because a group admin has no client permission to
 * cancel games they do not host, nor to clear groupIds off other members'
 * documents in bulk.
 */
export async function deleteGroup(groupId: string): Promise<{ gamesCancelled: number }> {
  const { auth } = await import('./firebase')
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('not-signed-in')
  const res = await fetch('/api/groups/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId }),
  })
  if (!res.ok) throw new Error(await res.text().catch(() => 'delete-failed'))
  return res.json()
}
