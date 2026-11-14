import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { sendFriendRequestEmail } from './serverEmail'

export type FriendStatus = 'pending' | 'accepted' | 'declined'

export interface Friendship {
  id: string
  requesterId: string
  receiverId: string
  status: FriendStatus
  createdAt: string
}

// Deterministic doc id for a pair (order-independent) so there's exactly one
// friendship document per pair regardless of who sent the request.
export function friendshipId(a: string, b: string): string {
  return [a, b].sort().join('_')
}

export async function getFriendship(a: string, b: string): Promise<Friendship | null> {
  const snap = await getDoc(doc(db, 'friendships', friendshipId(a, b)))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Friendship) : null
}

export async function sendFriendRequest(requesterId: string, receiverId: string): Promise<void> {
  if (requesterId === receiverId) return
  const id = friendshipId(requesterId, receiverId)
  const existing = await getDoc(doc(db, 'friendships', id))
  // Don't clobber an existing pending/accepted friendship; allow re-requesting
  // only after a previous decline.
  if (existing.exists() && existing.data().status !== 'declined') return
  await setDoc(doc(db, 'friendships', id), {
    requesterId,
    receiverId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  // Email the receiver, server-side (app/api/friend-request-email), which reads
  // their address and settings itself; this browser never sees either. Best
  // effort: a failure must never fail the request, which is already written.
  sendFriendRequestEmail(receiverId).catch(() => {})
}

export async function respondToFriendRequest(self: string, other: string, accept: boolean): Promise<void> {
  await updateDoc(doc(db, 'friendships', friendshipId(self, other)), {
    status: accept ? 'accepted' : 'declined',
  })
}

/**
 * Withdraws a pending request the caller sent, returning the pair to "no
 * friendship" so the button reverts to Add Friend.
 *
 * Deletes rather than setting status:'declined', a declined doc would block
 * re-sending (sendFriendRequest only overwrites a declined doc, and the UI would
 * still read a doc that exists). Deleting leaves no doc, which is exactly the
 * state before the request was sent.
 */
export async function cancelFriendRequest(self: string, other: string): Promise<void> {
  const ref = doc(db, 'friendships', friendshipId(self, other))
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const f = snap.data() as Friendship
  // Only the requester may withdraw, and only while it is still pending.
  if (f.requesterId !== self || f.status !== 'pending') return
  await deleteDoc(ref)
}

export async function unfriend(self: string, other: string): Promise<void> {
  await deleteDoc(doc(db, 'friendships', friendshipId(self, other)))
}

// Every friendship involving uid, keyed by the OTHER person's uid, lets the
// players directory render the right button (Add / Pending / Accept / Friends)
// for each card from a single fetch. Uses two single-field queries (no composite
// index required) and filters in memory.
export async function getFriendshipMap(uid: string): Promise<Record<string, Friendship>> {
  const [asReq, asRec] = await Promise.all([
    getDocs(query(collection(db, 'friendships'), where('requesterId', '==', uid))),
    getDocs(query(collection(db, 'friendships'), where('receiverId', '==', uid))),
  ])
  const map: Record<string, Friendship> = {}
  asReq.forEach((d) => { const f = { id: d.id, ...d.data() } as Friendship; map[f.receiverId] = f })
  asRec.forEach((d) => { const f = { id: d.id, ...d.data() } as Friendship; map[f.requesterId] = f })
  return map
}

// Pending requests sent TO uid (others → uid).
export async function getIncomingRequests(uid: string): Promise<Friendship[]> {
  const snap = await getDocs(query(collection(db, 'friendships'), where('receiverId', '==', uid)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Friendship))
    .filter((f) => f.status === 'pending')
}

// Live pending requests sent TO uid, powers the navbar badge and Requests tab.
export function subscribeIncomingRequests(uid: string, callback: (reqs: Friendship[]) => void) {
  return onSnapshot(query(collection(db, 'friendships'), where('receiverId', '==', uid)), (snap) => {
    callback(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Friendship))
        .filter((f) => f.status === 'pending'),
    )
  })
}

// uids of uid's accepted friends (either direction).
export async function getFriendUids(uid: string): Promise<string[]> {
  const [asReq, asRec] = await Promise.all([
    getDocs(query(collection(db, 'friendships'), where('requesterId', '==', uid))),
    getDocs(query(collection(db, 'friendships'), where('receiverId', '==', uid))),
  ])
  const uids: string[] = []
  asReq.forEach((d) => { const f = d.data() as Friendship; if (f.status === 'accepted') uids.push(f.receiverId) })
  asRec.forEach((d) => { const f = d.data() as Friendship; if (f.status === 'accepted') uids.push(f.requesterId) })
  return uids
}
