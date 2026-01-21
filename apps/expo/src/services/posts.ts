import {
  collection,
  setDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  getDoc,
  addDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
  runTransaction,
  documentId,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase/client';
import { PostDoc, PostStatus } from '@triply/shared/src/models';
import { getUserProfilesByIds } from './users';
import { getDownloadUrlCached } from '../firebase/storage';

const POSTS_COLLECTION = 'posts';
const POST_NOT_FOUND_CODE = 'post/not-found';

function createPostNotFoundError(postId: string): Error & { code: string } {
  const err = new Error(`Post ${postId} does not exist`) as Error & { code: string };
  err.code = POST_NOT_FOUND_CODE;
  return err;
}

export interface CreatePostParams {
  userId: string;
  text: string;
  imageUri?: string | null;
}

export interface Post extends PostDoc<Timestamp> {
  id: string;
  photoUrl?: string; // resolved download URL for display
  authorName?: string;
  authorAvatarUrl?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: Timestamp;
  authorName?: string;
  authorAvatarUrl?: string;
}

export interface PostEvent {
  id: string;
  type: string;
  actorId: string;
  createdAt?: Timestamp;
}

/**
 * Uploads image to Firebase Storage: posts/display/{uid}/{postId}.jpg
 */
async function uploadPostImage(userId: string, postId: string, uri: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const storagePath = `posts/display/${userId}/${postId}.jpg`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, blob);
    return storagePath;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/**
 * Creates a new post with 'pending' status.
 */
export async function createPost({ userId, text, imageUri }: CreatePostParams): Promise<void> {
  try {
    const postsRef = collection(db, POSTS_COLLECTION);
    const newPostRef = doc(postsRef);
    const postId = newPostRef.id;

    let photoPath: string | null = null;

    if (imageUri) {
      photoPath = await uploadPostImage(userId, postId, imageUri);
    }

    const newPost: PostDoc = {
      authorId: userId,
      text,
      tags: [],
      status: 'pending',
      photo: {
        displayPath: photoPath,
      },
      createdAt: serverTimestamp() as unknown, // Cast for client SDK compatibility
      updatedAt: serverTimestamp() as unknown,
      likeCount: 0,
      commentCount: 0,
    };

    await setDoc(newPostRef, newPost);
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toMillis === 'function') {
      try {
        return maybe.toMillis();
      } catch {
        // ignore
      }
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000;
    }
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function sortPostsNewestFirst(a: PostDoc<unknown>, b: PostDoc<unknown>): number {
  const aCreated = timestampToMillis((a as { createdAt?: unknown }).createdAt);
  const bCreated = timestampToMillis((b as { createdAt?: unknown }).createdAt);
  if (aCreated !== null || bCreated !== null) {
    return (bCreated ?? 0) - (aCreated ?? 0);
  }
  const aUpdated = timestampToMillis((a as { updatedAt?: unknown }).updatedAt);
  const bUpdated = timestampToMillis((b as { updatedAt?: unknown }).updatedAt);
  return (bUpdated ?? 0) - (aUpdated ?? 0);
}

/**
 * Helper to process post documents (resolve URLs and author names)
 */
async function processPostDocs(docs: any[]): Promise<Post[]> {
  const authorIds = Array.from(
    new Set(
      docs
        .map((d) => {
          try {
            return (d.data() as PostDoc<Timestamp>)?.authorId;
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    ),
  ) as string[];

  const profilesById = await getUserProfilesByIds(authorIds);
  const avatarUrlByPath: Record<string, string> = {};

  return Promise.all(
    docs.map(async (docSnap) => {
      const data = docSnap.data() as PostDoc<Timestamp>;
      let photoUrl = undefined;
      let authorName = 'Użytkownik';
      let authorAvatarUrl: string | undefined = undefined;

      if (data.photo?.displayPath) {
        try {
          const photoRef = ref(storage, data.photo.displayPath);
          photoUrl = await getDownloadURL(photoRef);
        } catch (e) {
          console.warn('Error fetching photo URL:', e);
        }
      }

      const profile = data.authorId ? profilesById.get(data.authorId) : undefined;
      if (profile?.username) authorName = profile.username;

      const avatarPath = profile?.avatarPath;
      if (typeof avatarPath === 'string' && avatarPath) {
        try {
          if (avatarUrlByPath[avatarPath]) {
            authorAvatarUrl = avatarUrlByPath[avatarPath];
          } else {
            const url = await getDownloadUrlCached(avatarPath);
            avatarUrlByPath[avatarPath] = url;
            authorAvatarUrl = url;
          }
        } catch (e) {
          console.warn('Error fetching avatar URL:', e);
        }
      }

      return {
        id: docSnap.id,
        ...data,
        photoUrl,
        authorName,
        authorAvatarUrl,
      };
    })
  );
}

/**
 * Fetch posts by status.
 */
export async function getPosts(status: PostStatus = 'approved'): Promise<Post[]> {
  try {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('status', '==', status),
    );

    const querySnapshot = await getDocs(q);
    const unsortedPosts = await processPostDocs(querySnapshot.docs);

    return [...unsortedPosts].sort((a, b) => sortPostsNewestFirst(a, b));
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

/**
 * Fetch all posts for a specific user (including pending), optionally filtered by status.
 */
export async function getUserPosts(userId: string, status?: PostStatus): Promise<Post[]> {
  try {
    let q;
    if (status) {
      q = query(
        collection(db, POSTS_COLLECTION),
        where('authorId', '==', userId),
        where('status', '==', status)
      );
    } else {
      q = query(collection(db, POSTS_COLLECTION), where('authorId', '==', userId));
    }

    const querySnapshot = await getDocs(q);
    const unsortedPosts = await processPostDocs(querySnapshot.docs);

    return [...unsortedPosts].sort((a, b) => sortPostsNewestFirst(a, b));
  } catch (error) {
    console.error('Error fetching user posts:', error);
    return [];
  }
}

/**
 * Fetch posts for a list of author IDs (chunked to handle Firestore 'in' limit of 10).
 * Always filters by status='approved'.
 */
export async function getPostsByAuthors(authorIds: string[]): Promise<Post[]> {
  if (authorIds.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < authorIds.length; i += 10) {
    chunks.push(authorIds.slice(i, i + 10));
  }

  try {
    const allDocs = [];
    
    for (const chunk of chunks) {
      const q = query(
        collection(db, POSTS_COLLECTION),
        where('status', '==', 'approved'),
        where('authorId', 'in', chunk)
      );
      const snapshot = await getDocs(q);
      allDocs.push(...snapshot.docs);
    }

    const unsortedPosts = await processPostDocs(allDocs);
    return [...unsortedPosts].sort((a, b) => sortPostsNewestFirst(a, b));
  } catch (error) {
    console.error('Error fetching posts by authors:', error);
    return [];
  }
}

/**
 * Approve a pending post.
 */
export async function approvePost(postId: string): Promise<void> {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const actorId = auth.currentUser?.uid ?? 'system';

    const batch = writeBatch(db);
    batch.update(postRef, {
      status: 'approved',
      rejectionReason: deleteField(),
      updatedAt: serverTimestamp(),
    });

    const eventRef = doc(collection(db, POSTS_COLLECTION, postId, 'postEvents'));
    batch.set(eventRef, {
      type: 'approved',
      actorId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error('Error approving post:', error);
    throw error;
  }
}

/**
 * Reject a pending post.
 */
export async function rejectPost(postId: string, reason?: string): Promise<void> {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const actorId = auth.currentUser?.uid ?? 'system';

    const reasonTrimmed = typeof reason === 'string' ? reason.trim() : '';
    const reasonValue = reasonTrimmed ? reasonTrimmed.slice(0, 240) : null;

    const batch = writeBatch(db);
    batch.update(postRef, {
      status: 'rejected',
      rejectionReason: reasonValue ? reasonValue : deleteField(),
      updatedAt: serverTimestamp(),
    });

    const eventRef = doc(collection(db, POSTS_COLLECTION, postId, 'postEvents'));
    batch.set(eventRef, {
      type: 'rejected',
      actorId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error('Error rejecting post:', error);
    throw error;
  }
}

/**
 * Fetch audit events for a post (admin-only in UI).
 */
export async function getPostEvents(postId: string): Promise<PostEvent[]> {
  const eventsRef = collection(db, POSTS_COLLECTION, postId, 'postEvents');
  const q = query(eventsRef, orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostEvent, 'id'>) }));
}

/**
 * Toggles a like for a post.
 * Returns true if liked, false if unliked.
 */
export async function toggleLike(postId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, POSTS_COLLECTION, postId, 'likes', userId);
  try {
    const likeSnap = await getDoc(likeRef);
    if (likeSnap.exists()) {
      await deleteDoc(likeRef);
      return false;
    } else {
      await setDoc(likeRef, { createdAt: serverTimestamp() });
      return true;
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
}

/**
 * Adds a comment to a post.
 */
export async function addComment(postId: string, userId: string, text: string): Promise<void> {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const commentsRef = collection(db, POSTS_COLLECTION, postId, 'comments');
    const newCommentRef = doc(commentsRef);

    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) {
        throw createPostNotFoundError(postId);
      }

      tx.set(newCommentRef, {
        authorId: userId,
        text,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

/**
 * Deletes a comment.
 */
export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);

    await runTransaction(db, async (tx) => {
      const [postSnap, commentSnap] = await Promise.all([tx.get(postRef), tx.get(commentRef)]);

      if (!postSnap.exists()) {
        throw createPostNotFoundError(postId);
      }

      // If the comment is already gone, do nothing.
      if (!commentSnap.exists()) {
        return;
      }

      tx.delete(commentRef);
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}

/**
 * Gets comments for a post.
 */
export async function getComments(postId: string): Promise<Comment[]> {
  const commentsRef = collection(db, POSTS_COLLECTION, postId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'));
  try {
    const snapshot = await getDocs(q);

    const raw = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, 'id'>) }));
    const authorIds = Array.from(new Set(raw.map((c) => c.authorId).filter(Boolean)));
    const profilesById = await getUserProfilesByIds(authorIds);
    const avatarUrlByPath: Record<string, string> = {};

    return await Promise.all(
      raw.map(async (c) => {
        const profile = profilesById.get(c.authorId);
        const authorName = profile?.username || 'Użytkownik';

        let authorAvatarUrl: string | undefined = undefined;
        const avatarPath = profile?.avatarPath;
        if (typeof avatarPath === 'string' && avatarPath) {
          try {
            if (avatarUrlByPath[avatarPath]) {
              authorAvatarUrl = avatarUrlByPath[avatarPath];
            } else {
              const url = await getDownloadUrlCached(avatarPath);
              avatarUrlByPath[avatarPath] = url;
              authorAvatarUrl = url;
            }
          } catch (e) {
            console.warn('Error fetching comment avatar URL:', e);
          }
        }

        return {
          ...c,
          authorName,
          authorAvatarUrl,
        };
      }),
    );
  } catch (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }
}

/**
 * Fetch a single post by id (approved/draft/pending depending on rules).
 * Resolves display image URL + author username (cached per call).
 */
export async function getPostById(postId: string): Promise<Post | null> {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const snap = await getDoc(postRef);
    if (!snap.exists()) return null;

    const data = snap.data() as PostDoc<Timestamp>;

    let photoUrl: string | undefined = undefined;
    let authorName = 'Użytkownik';
    let authorAvatarUrl: string | undefined = undefined;

    if (data.photo?.displayPath) {
      try {
        const photoRef = ref(storage, data.photo.displayPath);
        photoUrl = await getDownloadURL(photoRef);
      } catch (e) {
        console.warn('Error fetching photo URL:', e);
      }
    }

    if (data.authorId) {
      const profilesById = await getUserProfilesByIds([data.authorId]);
      const profile = profilesById.get(data.authorId);
      if (profile?.username) authorName = profile.username;
      const avatarPath = profile?.avatarPath;
      if (typeof avatarPath === 'string' && avatarPath) {
        try {
          authorAvatarUrl = await getDownloadUrlCached(avatarPath);
        } catch (e) {
          console.warn('Error fetching avatar URL:', e);
        }
      }
    }

    return {
      id: snap.id,
      ...data,
      photoUrl,
      authorName,
      authorAvatarUrl,
    };
  } catch (error) {
    console.error('Error fetching post by id:', error);
    return null;
  }
}
