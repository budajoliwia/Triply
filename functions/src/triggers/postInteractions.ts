import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createNotificationIfNotDuplicated } from '../services/notifications';

const db = getFirestore();

// --- Likes Counters ---

export const onLikeCreated = onDocumentCreated('posts/{postId}/likes/{userId}', async (event) => {
  const postId = event.params.postId;
  const likerUid = event.params.userId;
  const postRef = db.collection('posts').doc(postId);

  try {
    await postRef.update({
      likeCount: FieldValue.increment(1),
    });
    logger.info(`Incremented likeCount for post ${postId}`);

    // Create notification for post author (unless self-like)
    try {
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        logger.warn('[notifications][like] missing_post', { postId, likerUid, eventId: event.id });
        return;
      }
      const postData = postSnap.data() as { authorId?: unknown };
      const authorId = typeof postData.authorId === 'string' ? postData.authorId : null;
      if (!authorId) {
        logger.warn('[notifications][like] invalid_post_authorId', { postId, likerUid, eventId: event.id });
        return;
      }

      await createNotificationIfNotDuplicated(db, {
        targetUserId: authorId,
        actorId: likerUid,
        type: 'like',
        postId,
        eventId: event.id,
      });
    } catch (e) {
      logger.error('[notifications][like] failed', { postId, likerUid, eventId: event.id, error: e });
      // do not throw: likeCount increment already done, and we prefer not retrying just for notification.
    }
  } catch (error) {
    logger.error(`Error incrementing likeCount for post ${postId}`, error);
  }
});

export const onLikeDeleted = onDocumentDeleted('posts/{postId}/likes/{userId}', async (event) => {
  const postId = event.params.postId;
  const postRef = db.collection('posts').doc(postId);

  try {
    await postRef.update({
      likeCount: FieldValue.increment(-1),
    });
    logger.info(`Decremented likeCount for post ${postId}`);
  } catch (error) {
    logger.error(`Error decrementing likeCount for post ${postId}`, error);
  }
});

// --- Comments Counters ---

// DISABLED: Client updates counter transactionally for immediate feedback.
// Having both client update + Cloud Function causes double counting.

/*
export const onCommentCreated = onDocumentCreated(
  'posts/{postId}/comments/{commentId}',
  async (event) => {
    const postId = event.params.postId;
    const postRef = db.collection('posts').doc(postId);

    try {
      await postRef.update({
        commentCount: FieldValue.increment(1),
      });
      logger.info(`Incremented commentCount for post ${postId}`);
    } catch (error) {
      logger.error(`Error incrementing commentCount for post ${postId}`, error);
    }
  },
);

export const onCommentDeleted = onDocumentDeleted(
  'posts/{postId}/comments/{commentId}',
  async (event) => {
    const postId = event.params.postId;
    const postRef = db.collection('posts').doc(postId);

    try {
      await postRef.update({
        commentCount: FieldValue.increment(-1),
      });
      logger.info(`Decremented commentCount for post ${postId}`);
    } catch (error) {
      logger.error(`Error decrementing commentCount for post ${postId}`, error);
    }
  },
);
*/
