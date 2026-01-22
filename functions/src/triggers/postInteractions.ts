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
    logger.info('[posts][likeCount] increment', { postId, actorId: likerUid, delta: 1, eventId: event.id });

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
    logger.error('[posts][likeCount] increment_failed', { postId, actorId: likerUid, delta: 1, eventId: event.id, error });
  }
});

export const onLikeDeleted = onDocumentDeleted('posts/{postId}/likes/{userId}', async (event) => {
  const postId = event.params.postId;
  const likerUid = event.params.userId;
  const postRef = db.collection('posts').doc(postId);

  try {
    await postRef.update({
      likeCount: FieldValue.increment(-1),
    });
    logger.info('[posts][likeCount] decrement', { postId, actorId: likerUid, delta: -1, eventId: event.id });
  } catch (error) {
    logger.error('[posts][likeCount] decrement_failed', { postId, actorId: likerUid, delta: -1, eventId: event.id, error });
  }
});

// --- Comments Counters ---

export const onCommentCreated = onDocumentCreated('posts/{postId}/comments/{commentId}', async (event) => {
  const postId = event.params.postId;
  const commenterUid = event.data?.data()?.authorId as string | undefined;
  const postRef = db.collection('posts').doc(postId);

  try {
    await postRef.update({
      commentCount: FieldValue.increment(1),
    });
    logger.info('[posts][commentCount] increment', { postId, actorId: commenterUid, delta: 1, eventId: event.id });

    // Optional notification for post author (unless self-comment)
    try {
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        logger.warn('[notifications][comment] missing_post', { postId, commenterUid, eventId: event.id });
        return;
      }
      const postData = postSnap.data() as { authorId?: unknown };
      const authorId = typeof postData.authorId === 'string' ? postData.authorId : null;
      if (!authorId || !commenterUid || authorId === commenterUid) return;

      await createNotificationIfNotDuplicated(db, {
        targetUserId: authorId,
        actorId: commenterUid,
        type: 'comment',
        postId,
        eventId: event.id,
      });
    } catch (e) {
      logger.error('[notifications][comment] failed', { postId, commenterUid, eventId: event.id, error: e });
      // do not throw: commentCount increment already done, and we prefer not retrying just for notification.
    }
  } catch (error) {
    logger.error('[posts][commentCount] increment_failed', { postId, actorId: commenterUid, delta: 1, eventId: event.id, error });
  }
});

export const onCommentDeleted = onDocumentDeleted('posts/{postId}/comments/{commentId}', async (event) => {
  const postId = event.params.postId;
  const postRef = db.collection('posts').doc(postId);

  try {
    await db.runTransaction(async (t) => {
      const postSnap = await t.get(postRef);
      if (!postSnap.exists) return;

      const current = typeof postSnap.data()?.commentCount === 'number' ? postSnap.data()!.commentCount : 0;
      const next = Math.max(0, current - 1);
      t.update(postRef, { commentCount: next });
    });

    logger.info('[posts][commentCount] decrement', { postId, delta: -1, eventId: event.id });
  } catch (error) {
    logger.error('[posts][commentCount] decrement_failed', { postId, delta: -1, eventId: event.id, error });
  }
});
