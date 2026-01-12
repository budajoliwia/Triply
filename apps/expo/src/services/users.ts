import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/client';
import { UserDoc } from '@triply/shared/src/models';

const USERS_COLLECTION = 'users';

export interface UserProfile extends UserDoc {
  id: string;
}

/**
 * Fetch a user's public profile.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return { id: userSnap.id, ...(userSnap.data() as UserDoc) };
    }
    return null;
  } catch (error) {
    console.warn(`Error fetching user profile for ${userId}:`, error);
    return null;
  }
}

/**
 * Follow a user.
 */
export async function followUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (currentUserId === targetUserId) throw new Error('Cannot follow yourself');
  
  const followingRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);
  const followerMirrorRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);

  const batch = writeBatch(db);
  batch.set(followingRef, { createdAt: serverTimestamp() });
  batch.set(followerMirrorRef, { createdAt: serverTimestamp() });
  await batch.commit();

  if (__DEV__) {
    try {
      const [a, b] = await Promise.all([getDoc(followingRef), getDoc(followerMirrorRef)]);
      console.log(
        '[followUser][sanity] following exists=',
        a.exists(),
        'followers mirror exists=',
        b.exists(),
        'myUid=',
        currentUserId,
        'targetUid=',
        targetUserId,
      );
    } catch (e) {
      console.warn('[followUser][sanity] failed', e);
    }
  }
}

/**
 * Unfollow a user.
 */
export async function unfollowUser(currentUserId: string, targetUserId: string): Promise<void> {
  const followingRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);
  const followerMirrorRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);

  const batch = writeBatch(db);
  batch.delete(followingRef);
  batch.delete(followerMirrorRef);
  await batch.commit();

  if (__DEV__) {
    try {
      const [a, b] = await Promise.all([getDoc(followingRef), getDoc(followerMirrorRef)]);
      console.log(
        '[unfollowUser][sanity] following exists=',
        a.exists(),
        'followers mirror exists=',
        b.exists(),
        'myUid=',
        currentUserId,
        'targetUid=',
        targetUserId,
      );
    } catch (e) {
      console.warn('[unfollowUser][sanity] failed', e);
    }
  }
}

/**
 * Check if the current user follows the target user.
 */
export async function isFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
  const followingRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);
  const snap = await getDoc(followingRef);
  return snap.exists();
}

/**
 * Get a list of IDs of users that the current user follows.
 */
export async function getFollowingIds(currentUserId: string): Promise<string[]> {
  const followingRef = collection(db, USERS_COLLECTION, currentUserId, 'following');
  const snap = await getDocs(query(followingRef));
  return snap.docs.map((doc) => doc.id);
}

/**
 * Search users by username prefix.
 */
export async function searchUsers(searchQuery: string): Promise<UserProfile[]> {
  const qStr = searchQuery.trim().toLowerCase();
  if (!qStr) return [];

  const usersRef = collection(db, USERS_COLLECTION);
  // Firestore prefix search: >= query AND < query + \uf8ff
  const q = query(
    usersRef,
    where('usernameLower', '>=', qStr),
    where('usernameLower', '<', qStr + '\uf8ff'),
    limit(20)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as UserDoc),
    }));
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}
