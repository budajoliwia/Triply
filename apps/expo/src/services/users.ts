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
  documentId,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase/client';
import { UserDoc } from '@triply/shared/src/models';
import { getDownloadUrlCached, uploadUserAvatarJpeg } from '../firebase/storage';

const USERS_COLLECTION = 'users';

export interface UserProfile extends UserDoc {
  id: string;
  /** Resolved download URL for display (not stored in Firestore) */
  avatarUrl?: string;
}

/**
 * Fetch user profiles in batches (Firestore `in` query max is 10).
 * Useful to avoid N+1 fetch when rendering notifications.
 */
export async function getUserProfilesByIds(userIds: string[]): Promise<Map<string, UserProfile>> {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  const result = new Map<string, UserProfile>();
  if (ids.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  try {
    for (const chunk of chunks) {
      const q = query(collection(db, USERS_COLLECTION), where(documentId(), 'in', chunk));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        result.set(d.id, { id: d.id, ...(d.data() as UserDoc) });
      }
    }
  } catch (error) {
    console.warn('Error fetching user profiles by ids:', error);
  }

  return result;
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

export async function resolveAvatarUrl(avatarPath?: string | null): Promise<string | null> {
  if (!avatarPath) return null;
  try {
    return await getDownloadUrlCached(avatarPath);
  } catch (e) {
    console.warn('Failed to resolve avatar download URL:', e);
    return null;
  }
}

export type UpdateMyProfileParams = {
  userId: string;
  bio?: string | null;
  /** Local file URI (already resized/compressed) */
  avatarLocalUri?: string | null;
};

/**
 * Updates the current user's profile fields (bio + avatarPath).
 * Storage upload is performed first (stable path overwrite), then Firestore update.
 */
export async function updateMyProfile({
  userId,
  bio,
  avatarLocalUri,
}: UpdateMyProfileParams): Promise<{ avatarPath?: string | null }> {
  const updates: Record<string, unknown> = {};

  const bioTrimmed = typeof bio === 'string' ? bio.trim() : '';
  if (bio === null) {
    updates.bio = deleteField();
  } else if (!bioTrimmed) {
    updates.bio = deleteField();
  } else {
    updates.bio = bioTrimmed.slice(0, 160);
  }

  let avatarPath: string | null | undefined = undefined;
  if (avatarLocalUri) {
    avatarPath = await uploadUserAvatarJpeg(userId, avatarLocalUri);
    updates.avatarPath = avatarPath;
  }

  const userRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userRef, updates);

  return { avatarPath };
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

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as UserDoc),
  }));
}
