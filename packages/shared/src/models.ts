/**
 * Shared Firestore models for Triply.
 *
 * Intentionally does NOT import Firebase types (Timestamp, DocumentReference, ...)
 * so it can be used by both:
 * - Expo (firebase client SDK)
 * - Cloud Functions (firebase-admin)
 *
 * Consumers can parameterize timestamp types if they want stronger typing:
 * `PostDoc<FirebaseFirestore.Timestamp>` (admin) or `PostDoc<Timestamp>` (client).
 */

/** "YYYY-MM-DD" (e.g. "2026-01-07") */
export type ISODateString =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export function isISODateString(value: string): value is ISODateString {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export type UserRole = 'user' | 'admin';

export type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type PostEventType =
  | 'created'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'like_added'
  | 'comment_added';

export type DocId = string;

export type WithId<T> = T & { id: DocId };

export interface UserDoc<TTimestamp = unknown> {
  email: string;
  username: string;
  usernameLower: string;
  role: UserRole;

  /** Default: 5 */
  dailyPostLimit: number;

  /** How many posts were used "today" (based on `lastUsageDate`) */
  usedToday: number;

  /** Local date string used for daily limit reset */
  lastUsageDate: ISODateString;

  followersCount: number;
  followingCount: number;

  createdAt: TTimestamp;
}

export interface PostPhoto {
  /** Storage path, e.g. "posts/original/..." */
  originalPath?: string | null;
  /** Storage path for compressed / display-ready image */
  displayPath?: string | null;
}

export interface PostDoc<TTimestamp = unknown> {
  authorId: DocId;
  text: string;

  /** Max 3 tags (enforced in app/backend) */
  tags: string[];

  status: PostStatus;
  photo: PostPhoto;

  createdAt: TTimestamp;
  updatedAt: TTimestamp;

  rejectionReason?: string;

  likeCount: number;
  commentCount: number;
}

export interface LikeDoc<TTimestamp = unknown> {
  createdAt: TTimestamp;
}

export interface CommentDoc<TTimestamp = unknown> {
  authorId: DocId;
  text: string;
  createdAt: TTimestamp;
}

export type PostEventMeta = Record<string, unknown>;

export interface PostEventDoc<TTimestamp = unknown> {
  postId: DocId;
  actorId: DocId;
  type: PostEventType;
  createdAt: TTimestamp;
  meta?: PostEventMeta;
}
