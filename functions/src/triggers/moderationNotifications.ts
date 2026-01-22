import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

const USER_NOTIFICATIONS_COLLECTION = 'notifications';
const USER_NOTIFICATION_ITEMS_SUBCOLLECTION = 'items';

type PostEventDoc = {
  type?: unknown;
  actorId?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function userNotificationDocId(type: string, postId: string): string {
  return `${type}_${postId}`;
}

export const onAdminModerationEventNotifyAuthor = onDocumentCreated(
  'posts/{postId}/postEvents/{eventId}',
  async (event) => {
    const postId = event.params.postId as string;
    const eventId = event.params.eventId as string;

    const data = (event.data?.data() ?? {}) as PostEventDoc;
    const type = asString(data.type);
    const actorId = asString(data.actorId);

    // Only admin actions created by the client.
    if (type !== 'approved' && type !== 'rejected') return;
    if (!actorId) {
      logger.warn('[moderationNotifications] missing_actorId', { postId, eventId, type });
      return;
    }

    try {
      const postRef = db.collection('posts').doc(postId);
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        logger.warn('[moderationNotifications] missing_post', { postId, eventId, type, actorId });
        return;
      }

      const postData = postSnap.data() as Record<string, unknown>;
      const authorId = asString((postData as any).authorId);
      if (!authorId) {
        logger.warn('[moderationNotifications] missing_authorId', { postId, eventId, type, actorId });
        return;
      }

      const rejectionReason = asString((postData as any).rejectionReason);

      const notifType = type === 'approved' ? 'post_admin_approved' : 'post_admin_rejected';
      const notifId = userNotificationDocId(notifType, postId);

      const notifRef = db
        .collection(USER_NOTIFICATIONS_COLLECTION)
        .doc(authorId)
        .collection(USER_NOTIFICATION_ITEMS_SUBCOLLECTION)
        .doc(notifId);

      const messagePL =
        notifType === 'post_admin_approved'
          ? 'Post został zatwierdzony przez admina.'
          : rejectionReason
            ? `Post został odrzucony przez admina. Powód: ${rejectionReason}`.slice(0, 240)
            : 'Post został odrzucony przez admina.';

      const payload: Record<string, unknown> = {
        type: notifType,
        postId,
        actorId, // admin uid
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        messagePL,
        ...(notifType === 'post_admin_rejected' && rejectionReason ? { meta: { rejectionReason } } : {}),
      };

      // Idempotent: deterministic docId per post+type.
      try {
        await notifRef.create(payload);
        logger.info('[moderationNotifications] created', { postId, authorId, actorId, notifType, notifId, eventId });
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? '';
        const alreadyExists = msg.includes('ALREADY_EXISTS') || msg.includes('already exists');
        if (alreadyExists) {
          logger.info('[moderationNotifications] already_exists (idempotent)', { postId, authorId, actorId, notifType, notifId, eventId });
          return;
        }
        throw e;
      }
    } catch (error) {
      logger.error('[moderationNotifications] failed', { postId, eventId, type, actorId, error });
      throw error; // retry
    }
  },
);


