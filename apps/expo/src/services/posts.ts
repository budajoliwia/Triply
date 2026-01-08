import {
  collection,
  setDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/client';
import { PostDoc, PostStatus } from '@triply/shared/src/models';

const POSTS_COLLECTION = 'posts';

export interface CreatePostParams {
  userId: string;
  text: string;
  imageUri?: string | null;
}

export interface Post extends PostDoc<Timestamp> {
  id: string;
  photoUrl?: string; // resolved download URL for display
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

    let photoPath: string | undefined = undefined;

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

/**
 * Fetch posts by status.
 * Resolves storage paths to download URLs.
 */
export async function getPosts(status: PostStatus = 'approved'): Promise<Post[]> {
  try {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
    );

    const querySnapshot = await getDocs(q);

    const posts: Post[] = await Promise.all(
      querySnapshot.docs.map(async (doc) => {
        const data = doc.data() as PostDoc<Timestamp>;
        let photoUrl = undefined;

        if (data.photo?.displayPath) {
          try {
            const photoRef = ref(storage, data.photo.displayPath);
            photoUrl = await getDownloadURL(photoRef);
          } catch (e) {
            console.warn('Error fetching photo URL:', e);
          }
        }

        return {
          id: doc.id,
          ...data,
          photoUrl,
        };
      }),
    );

    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
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
