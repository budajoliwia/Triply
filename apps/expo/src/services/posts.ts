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
  serverTimestamp,
  Timestamp,
  runTransaction,
  documentId,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/client';
import { PostDoc, PostStatus } from '@triply/shared/src/models';
import { getUserProfile } from './users';

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
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: Timestamp;
  authorName?: string;
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
  const userCache: Record<string, string> = {};

  return Promise.all(
    docs.map(async (docSnap) => {
      const data = docSnap.data() as PostDoc<Timestamp>;
      let photoUrl = undefined;
      let authorName = 'Użytkownik';

      if (data.photo?.displayPath) {
        try {
          const photoRef = ref(storage, data.photo.displayPath);
          photoUrl = await getDownloadURL(photoRef);
        } catch (e) {
          console.warn('Error fetching photo URL:', e);
        }
      }

      if (data.authorId) {
        if (userCache[data.authorId]) {
          authorName = userCache[data.authorId];
        } else {
          const profile = await getUserProfile(data.authorId);
          if (profile?.username) {
            authorName = profile.username;
            userCache[data.authorId] = authorName;
          }
        }
      }

      return {
        id: docSnap.id,
        ...data,
        photoUrl,
        authorName,
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
    await updateDoc(postRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error approving post:', error);
    throw error;
  }
}

/**
 * Reject a pending post.
 */
export async function rejectPost(postId: string): Promise<void> {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error rejecting post:', error);
    throw error;
  }
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

      const postData = postSnap.data() as Partial<PostDoc<Timestamp>>;
      const currentCount = typeof postData.commentCount === 'number' ? postData.commentCount : 0;

      tx.set(newCommentRef, {
        authorId: userId,
        text,
        createdAt: serverTimestamp(),
      });

      tx.update(postRef, {
        commentCount: currentCount + 1,
        updatedAt: serverTimestamp(),
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

      // If the comment is already gone, don't decrement the counter.
      if (!commentSnap.exists()) {
        return;
      }

      const postData = postSnap.data() as Partial<PostDoc<Timestamp>>;
      const currentCount = typeof postData.commentCount === 'number' ? postData.commentCount : 0;
      const nextCount = Math.max(0, currentCount - 1);

      tx.delete(commentRef);
      tx.update(postRef, {
        commentCount: nextCount,
        updatedAt: serverTimestamp(),
      });
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
    
    const userCache: Record<string, string> = {};

    const comments = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data() as Omit<Comment, 'id' | 'authorName'>;
        let authorName = 'Użytkownik';

        if (data.authorId) {
          if (userCache[data.authorId]) {
            authorName = userCache[data.authorId];
          } else {
            const profile = await getUserProfile(data.authorId);
            if (profile?.username) {
              authorName = profile.username;
              userCache[data.authorId] = authorName;
            }
          }
        }

        return {
          id: doc.id,
          ...data,
          authorName,
        };
      })
    );

    return comments;
  } catch (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }
}
