import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/client';

export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'post_ai_approved'
  | 'post_ai_rejected'
  | 'post_ai_review'
  | 'post_admin_approved'
  | 'post_admin_rejected';

export interface Notification {
  id: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  createdAt?: Timestamp;
  read: boolean;
  messagePL?: string;
  meta?: { rejectionReason?: string } & Record<string, unknown>;
}

const NOTIFICATIONS_COLLECTION = 'notifications';
const NOTIFICATION_ITEMS_SUBCOLLECTION = 'items';

function itemsColRef(myUid: string) {
  return collection(db, NOTIFICATIONS_COLLECTION, myUid, NOTIFICATION_ITEMS_SUBCOLLECTION);
}

export function subscribeNotifications(
  myUid: string,
  options: { limit: number },
  onValue: (items: Notification[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(
    itemsColRef(myUid),
    orderBy('createdAt', 'desc'),
    limit(options.limit),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: Notification[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notification, 'id'>) }));
      onValue(items);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeUnreadCount(
  myUid: string,
  onValue: (count: number) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  // Limit 10 so we can show "9+" without downloading unbounded docs.
  const q = query(
    itemsColRef(myUid),
    where('read', '==', false),
    limit(10),
  );

  return onSnapshot(
    q,
    (snap) => {
      onValue(snap.size);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function markNotificationsRead(myUid: string, notificationIds: string[]): Promise<void> {
  const ids = Array.from(new Set(notificationIds)).filter(Boolean);
  if (!myUid || ids.length === 0) return;

  const batch = writeBatch(db);
  for (const id of ids) {
    const ref = doc(db, NOTIFICATIONS_COLLECTION, myUid, NOTIFICATION_ITEMS_SUBCOLLECTION, id);
    batch.update(ref, { read: true });
  }
  await batch.commit();
}

export async function markNotificationRead(myUid: string, notificationId: string): Promise<void> {
  if (!myUid || !notificationId) return;
  const ref = doc(db, NOTIFICATIONS_COLLECTION, myUid, NOTIFICATION_ITEMS_SUBCOLLECTION, notificationId);
  await updateDoc(ref, { read: true });
}


