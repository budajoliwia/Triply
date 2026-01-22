import * as logger from 'firebase-functions/logger';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';

export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'post_ai_approved'
  | 'post_ai_rejected'
  | 'post_ai_review'
  | 'post_admin_approved'
  | 'post_admin_rejected';

export interface CreateNotificationParams {
  /** Receiver */
  targetUserId: string;
  /** Actor */
  actorId: string;
  type: NotificationType;
  postId?: string;
  /** Optional short Polish message (used for moderation notifications) */
  messagePL?: string;
  /** Optional meta payload */
  meta?: Record<string, unknown>;

  /**
   * Firestore-trigger event id (stable across retries).
   * Used for idempotency by writing notification doc under this id.
   */
  eventId: string;
}

const NOTIFICATIONS_COLLECTION = 'notifications';
const NOTIFICATION_ITEMS_SUBCOLLECTION = 'items';

const DEDUPE_WINDOW_MINUTES = 10;
const DEDUPE_SCAN_LIMIT = 25;

type NotificationDoc = {
  actorId: string;
  type: NotificationType;
  postId?: string;
  messagePL?: string;
  meta?: Record<string, unknown>;
  createdAt: FirebaseFirestore.FieldValue;
  read: boolean;
};

function isSameNotification(
  n: Record<string, unknown>,
  params: { actorId: string; type: NotificationType; postId?: string },
): boolean {
  return (
    n.actorId === params.actorId &&
    n.type === params.type &&
    (typeof params.postId === 'string' ? n.postId === params.postId : n.postId == null)
  );
}

export async function createNotificationIfNotDuplicated(
  db: Firestore,
  params: CreateNotificationParams,
): Promise<'created' | 'skipped_duplicate' | 'skipped_self' | 'skipped_invalid'> {
  const { targetUserId, actorId, type, postId, eventId, messagePL, meta } = params;

  if (!targetUserId || !actorId || !type || !eventId) {
    logger.warn('[notifications] skipped_invalid', { targetUserId, actorId, type, postId, eventId });
    return 'skipped_invalid';
  }

  if (targetUserId === actorId) {
    logger.info('[notifications] skipped_self', { targetUserId, actorId, type, postId, eventId });
    return 'skipped_self';
  }

  // Dedupe only for follow/like as required.
  const shouldDedupe = type === 'follow' || type === 'like';
  if (shouldDedupe) {
    const cutoffMillis = Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000;
    const cutoffTs = Timestamp.fromMillis(cutoffMillis);

    try {
      const snap = await db
        .collection(NOTIFICATIONS_COLLECTION)
        .doc(targetUserId)
        .collection(NOTIFICATION_ITEMS_SUBCOLLECTION)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(DEDUPE_SCAN_LIMIT)
        .get();

      const isDuplicate = snap.docs.some((d) => {
        const data = d.data() as { createdAt?: Timestamp } & Record<string, unknown>;
        const createdAt = data.createdAt;
        if (!(createdAt instanceof Timestamp)) return false;
        if (createdAt.toMillis() < cutoffTs.toMillis()) return false;
        return isSameNotification(data, { actorId, type, postId });
      });

      if (isDuplicate) {
        logger.info('[notifications] skipped_duplicate', { targetUserId, actorId, type, postId, eventId });
        return 'skipped_duplicate';
      }
    } catch (error) {
      // If dedupe query fails, still attempt to create (prefer notifying vs silent failure).
      logger.error('[notifications] dedupe_query_failed', { targetUserId, actorId, type, postId, eventId, error });
    }
  }

  const docRef = db
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(targetUserId)
    .collection(NOTIFICATION_ITEMS_SUBCOLLECTION)
    .doc(eventId);

  const payload: NotificationDoc = {
    actorId,
    type,
    ...(typeof postId === 'string' ? { postId } : {}),
    ...(typeof messagePL === 'string' && messagePL.trim() ? { messagePL: messagePL.trim().slice(0, 240) } : {}),
    ...(meta && typeof meta === 'object' ? { meta } : {}),
    createdAt: FieldValue.serverTimestamp(),
    read: false,
  };

  try {
    // Idempotency: if retry happens, `create` will throw ALREADY_EXISTS and we treat it as created.
    await docRef.create(payload);
    logger.info('[notifications] created', { targetUserId, actorId, type, postId, eventId });
    return 'created';
  } catch (error) {
    const message = (error as { message?: string })?.message ?? '';
    if (message.includes('ALREADY_EXISTS') || message.includes('already exists')) {
      logger.info('[notifications] already_exists (idempotent)', { targetUserId, actorId, type, postId, eventId });
      return 'created';
    }
    logger.error('[notifications] create_failed', { targetUserId, actorId, type, postId, eventId, error });
    throw error;
  }
}


