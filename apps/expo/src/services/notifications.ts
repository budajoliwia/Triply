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

export type NotificationType = 'follow' | 'like' | 'comment';

export interface Notification {
  id: string;
  targetUserId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  createdAt?: Timestamp;
  read: boolean;
}

const NOTIFICATIONS_COLLECTION = 'notifications';

export function subscribeNotifications(
  myUid: string,
  options: { limit: number },
  onValue: (items: Notification[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('targetUserId', '==', myUid),
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
    collection(db, NOTIFICATIONS_COLLECTION),
    where('targetUserId', '==', myUid),
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

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  const ids = Array.from(new Set(notificationIds)).filter(Boolean);
  if (ids.length === 0) return;

  const batch = writeBatch(db);
  for (const id of ids) {
    const ref = doc(db, NOTIFICATIONS_COLLECTION, id);
    batch.update(ref, { read: true });
  }
  await batch.commit();
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  const ref = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(ref, { read: true });
}


