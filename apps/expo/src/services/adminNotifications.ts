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

export type AdminNotificationType = 'post_needs_review';

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  postId: string;
  actorId: string; // 'system'
  createdAt?: Timestamp;
  read: boolean;
  meta?: { categories?: Record<string, number>; score?: number } & Record<string, unknown>;
}

const ADMIN_NOTIFICATIONS_COLLECTION = 'adminNotifications';

export function subscribeAdminNotifications(
  options: { limit: number; unreadOnly?: boolean },
  onValue: (items: AdminNotification[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const base = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
  const constraints: any[] = [];
  if (options.unreadOnly) constraints.push(where('read', '==', false));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(options.limit));

  const q = query(base, ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const items: AdminNotification[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminNotification, 'id'>) }));
      onValue(items);
    },
    (error) => onError?.(error),
  );
}

export function subscribeAdminUnreadCount(
  onValue: (count: number) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(collection(db, ADMIN_NOTIFICATIONS_COLLECTION), where('read', '==', false), limit(10));
  return onSnapshot(
    q,
    (snap) => onValue(snap.size),
    (error) => onError?.(error),
  );
}

export async function markAdminNotificationRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  const ref = doc(db, ADMIN_NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(ref, { read: true });
}

export async function markAdminNotificationsRead(notificationIds: string[]): Promise<void> {
  const ids = Array.from(new Set(notificationIds)).filter(Boolean);
  if (ids.length === 0) return;

  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, ADMIN_NOTIFICATIONS_COLLECTION, id), { read: true });
  }
  await batch.commit();
}


