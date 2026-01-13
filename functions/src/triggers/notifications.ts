import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { createNotificationIfNotDuplicated } from '../services/notifications';

const db = getFirestore();

export const onFollowerCreatedCreateNotification = onDocumentCreated(
  'users/{uid}/followers/{followerUid}',
  async (event) => {
    const { uid, followerUid } = event.params;

    try {
      logger.info('[notifications][follow] event', { uid, followerUid, eventId: event.id });
      await createNotificationIfNotDuplicated(db, {
        targetUserId: uid,
        actorId: followerUid,
        type: 'follow',
        eventId: event.id,
      });
    } catch (error) {
      logger.error('[notifications][follow] failed', { uid, followerUid, eventId: event.id, error });
      throw error; // retry
    }
  },
);

export const onCommentCreatedCreateNotification = onDocumentCreated(
  'posts/{postId}/comments/{commentId}',
  async (event) => {
    const { postId, commentId } = event.params;
    const eventId = event.id;

    try {
      const commentSnap = await event.data?.ref.get();
      if (!commentSnap?.exists) {
        logger.warn('[notifications][comment] missing_comment', { postId, commentId, eventId });
        return;
      }

      const commentData = commentSnap.data() as { authorId?: unknown };
      const commentAuthorId = typeof commentData.authorId === 'string' ? commentData.authorId : null;
      if (!commentAuthorId) {
        logger.warn('[notifications][comment] invalid_comment_authorId', { postId, commentId, eventId });
        return;
      }

      const postRef = db.collection('posts').doc(postId);
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        logger.warn('[notifications][comment] missing_post', { postId, commentId, eventId });
        return;
      }

      const postData = postSnap.data() as { authorId?: unknown };
      const postAuthorId = typeof postData.authorId === 'string' ? postData.authorId : null;
      if (!postAuthorId) {
        logger.warn('[notifications][comment] invalid_post_authorId', { postId, commentId, eventId });
        return;
      }

      logger.info('[notifications][comment] create', {
        postId,
        commentId,
        targetUserId: postAuthorId,
        actorId: commentAuthorId,
        eventId,
      });

      await createNotificationIfNotDuplicated(db, {
        targetUserId: postAuthorId,
        actorId: commentAuthorId,
        type: 'comment',
        postId,
        eventId,
      });
    } catch (error) {
      logger.error('[notifications][comment] failed', { postId, commentId, eventId, error });
      throw error; // retry
    }
  },
);


