import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  moderateImageWithOpenAI,
  moderateTextWithOpenAI,
  type AiModerationDecision,
  type AiModerationResult,
} from '../services/aiPostModeration';

const db = getFirestore();
const storage = getStorage();

const ADMIN_NOTIFICATIONS_COLLECTION = 'adminNotifications';
const USER_NOTIFICATIONS_COLLECTION = 'notifications';
const USER_NOTIFICATION_ITEMS_SUBCOLLECTION = 'items';

function hasTextCheckedAt(data: Record<string, unknown>): boolean {
  const moderation = data.moderation;
  if (!moderation || typeof moderation !== 'object') return false;
  return !!(moderation as Record<string, unknown>).checkedAt;
}

function hasImageCheckedAt(data: Record<string, unknown>): boolean {
  const moderation = data.moderation;
  if (!moderation || typeof moderation !== 'object') return false;
  const image = (moderation as Record<string, unknown>).image;
  if (!image || typeof image !== 'object') return false;
  return !!(image as Record<string, unknown>).checkedAt;
}

function asPostStatus(value: unknown): 'draft' | 'pending' | 'approved' | 'rejected' | null {
  if (value === 'draft' || value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return null;
}

function deterministicEventId(eventId: string, suffix: string): string {
  // Firestore doc IDs can include underscores; keep it simple and deterministic.
  return `${eventId}_${suffix}`;
}

function outcomeEventType(decision: AiModerationDecision): 'ai_approved' | 'ai_flagged' | 'ai_rejected' {
  if (decision === 'ALLOW') return 'ai_approved';
  if (decision === 'BLOCK') return 'ai_rejected';
  return 'ai_flagged';
}

function combineDecisions(params: {
  textDecision: AiModerationDecision;
  imageDecision: AiModerationDecision | null;
}): AiModerationDecision {
  const { textDecision, imageDecision } = params;
  if (textDecision === 'BLOCK' || imageDecision === 'BLOCK') return 'BLOCK';
  if (textDecision === 'REVIEW' || imageDecision === 'REVIEW') return 'REVIEW';
  return 'ALLOW';
}

function asDecision(value: unknown): AiModerationDecision | null {
  if (value === 'ALLOW' || value === 'REVIEW' || value === 'BLOCK') return value;
  return null;
}

function mergeCategories(a?: Record<string, number> | null, b?: Record<string, number> | null): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (obj?: Record<string, number> | null) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (!k) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const prev = typeof out[k] === 'number' ? out[k] : 0;
      out[k] = Math.max(prev, v);
    }
  };
  add(a);
  add(b);
  return out;
}

function userNotificationDocId(type: string, postId: string): string {
  return `${type}_${postId}`;
}

function deriveStoragePathFromUrl(url: string): string | null {
  // Try to handle:
  // - gs://bucket/path
  // - https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
  // - https://storage.googleapis.com/{bucket}/{path}
  try {
    if (url.startsWith('gs://')) {
      const without = url.slice('gs://'.length);
      const slash = without.indexOf('/');
      if (slash >= 0) return without.slice(slash + 1);
      return null;
    }

    const u = new URL(url);
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const parts = u.pathname.split('/');
      // /v0/b/{bucket}/o/{object}
      const oIndex = parts.indexOf('o');
      if (oIndex >= 0 && parts[oIndex + 1]) {
        return decodeURIComponent(parts[oIndex + 1]);
      }
    }
    if (u.hostname === 'storage.googleapis.com') {
      // /{bucket}/{path...}
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return parts.slice(1).join('/');
    }
    return null;
  } catch {
    return null;
  }
}

function extractPhotoStoragePath(data: Record<string, unknown>): string | null {
  // Preferred: photoPath (legacy) or photo.displayPath (current)
  const photoPath = typeof (data as any).photoPath === 'string' ? ((data as any).photoPath as string) : null;
  if (photoPath && photoPath.trim()) return photoPath.trim();

  const photo = (data as any).photo;
  const displayPath = typeof photo?.displayPath === 'string' ? (photo.displayPath as string) : null;
  if (displayPath && displayPath.trim()) return displayPath.trim();

  // Fallback: try to derive from photoUrl if it exists on doc
  const photoUrl = typeof (data as any).photoUrl === 'string' ? ((data as any).photoUrl as string) : null;
  if (photoUrl && photoUrl.trim()) return deriveStoragePathFromUrl(photoUrl.trim());

  return null;
}

async function loadImageBufferFromStorage(storagePath: string): Promise<
  | { kind: 'ok'; buffer: Buffer; mimeType: string; sizeBytes: number }
  | { kind: 'review'; reason: 'missing' | 'too_large' | 'invalid' }
> {
  const path = (storagePath ?? '').trim();
  if (!path) return { kind: 'review', reason: 'invalid' };

  const file = storage.bucket().file(path);
  try {
    const [meta] = await file.getMetadata();
    const sizeBytes = Number(meta.size ?? 0);
    const mimeType = typeof meta.contentType === 'string' && meta.contentType ? meta.contentType : 'image/jpeg';

    const MAX_BYTES = 5 * 1024 * 1024;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { kind: 'review', reason: 'invalid' };
    if (sizeBytes > MAX_BYTES) return { kind: 'review', reason: 'too_large' };

    const [buf] = await file.download();
    return { kind: 'ok', buffer: buf as Buffer, mimeType, sizeBytes };
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? '';
    const notFoundLike = msg.includes('No such object') || msg.includes('Not Found') || msg.includes('404');
    if (notFoundLike) return { kind: 'review', reason: 'missing' };
    throw e;
  }
}

async function moderatePostIfNeeded(params: {
  postId: string;
  eventId: string;
  afterData: Record<string, unknown>;
}) {
  const { postId, eventId, afterData } = params;

  const status = asPostStatus(afterData.status);
  if (status !== 'pending') return;

  const text = typeof afterData.text === 'string' ? afterData.text : '';
  const title = typeof afterData.title === 'string' ? afterData.title : null; // optional (not in shared model)

  const hasImage = !!extractPhotoStoragePath(afterData);
  const needText = !hasTextCheckedAt(afterData);
  const needImage = hasImage && !hasImageCheckedAt(afterData);
  if (!needText && !needImage) return;

  let textResult: AiModerationResult | null = null;
  let imageResult: AiModerationResult | null = null;
  let imageRejectionReason: string | null = null;

  try {
    if (needText) {
      textResult = await moderateTextWithOpenAI({ title, text });
    }

    if (needImage) {
      const storagePath = extractPhotoStoragePath(afterData);
      if (!storagePath) {
        imageResult = {
          decision: 'REVIEW',
          score: 0.5,
          categories: { nudity: 0, violence: 0, guardrail_missing_path: 1 },
          modelVersion: `guardrail@postmod-v1`,
        };
      } else {
        const loaded = await loadImageBufferFromStorage(storagePath);
        if (loaded.kind === 'review') {
          logger.warn('[aiModeration][image] guardrail_review', { postId, eventId, storagePath, reason: loaded.reason });
          imageResult = {
            decision: 'REVIEW',
            score: 0.5,
            categories: {
              nudity: 0,
              violence: 0,
              ...(loaded.reason === 'missing' ? { guardrail_missing_file: 1 } : {}),
              ...(loaded.reason === 'too_large' ? { guardrail_too_large: 1 } : {}),
              ...(loaded.reason === 'invalid' ? { guardrail_invalid_file: 1 } : {}),
            },
            modelVersion: `guardrail@postmod-v1`,
          };
        } else {
          imageResult = await moderateImageWithOpenAI({ imageBuffer: loaded.buffer, mimeType: loaded.mimeType });
          imageRejectionReason = imageResult.rejectionReason ?? null;
        }
      }
    }
  } catch (error) {
    // Fail-safe: never auto-approve on error/timeout; leave as pending.
    logger.error('[aiModeration][trigger] moderation_failed', { postId, eventId, error });
    return;
  }

  const startedDocId = deterministicEventId(eventId, 'ai_review_started');
  // outcome decided in transaction using current+new results.
  const actorId = 'system';

  try {
    await db.runTransaction(async (t) => {
      const postRef = db.collection('posts').doc(postId);
      const postSnap = await t.get(postRef);
      if (!postSnap.exists) return;

      const current = postSnap.data() as Record<string, unknown>;
      const currentStatus = asPostStatus(current.status);
      if (currentStatus !== 'pending') return;

      const authorId = typeof (current as any).authorId === 'string' ? ((current as any).authorId as string) : null;
      if (!authorId) {
        logger.warn('[aiModeration] missing_authorId', { postId, eventId });
        return;
      }

      const currentTextDecision = asDecision((current as any)?.moderation?.decision) ?? 'REVIEW';
      const currentImageDecision = asDecision((current as any)?.moderation?.image?.decision);

      const stillNeedText = !hasTextCheckedAt(current);
      const currentHasImage = !!extractPhotoStoragePath(current);
      const stillNeedImage = currentHasImage && !hasImageCheckedAt(current);

      // Nothing to do (can happen on retries / races). Avoid extra writes/events.
      if (!stillNeedText && !stillNeedImage) return;

      // If something already ran, avoid overwriting those results.
      if (stillNeedText && !textResult) return;
      if (stillNeedImage && !imageResult) return;

      const finalTextDecision = stillNeedText ? (textResult!.decision as AiModerationDecision) : currentTextDecision;
      const finalImageDecision = currentHasImage
        ? stillNeedImage
          ? (imageResult!.decision as AiModerationDecision)
          : currentImageDecision ?? 'REVIEW'
        : null;

      const combinedDecision = combineDecisions({ textDecision: finalTextDecision, imageDecision: finalImageDecision });

      const updates: Record<string, unknown> = {
        autoModerated: true,
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Only set fields that are missing (idempotent / no loops).
      if (stillNeedText && textResult) {
        updates['moderation.decision'] = textResult.decision;
        updates['moderation.score'] = textResult.score;
        updates['moderation.categories'] = textResult.categories;
        updates['moderation.checkedAt'] = FieldValue.serverTimestamp();
        updates['moderation.modelVersion'] = textResult.modelVersion;
      }

      if (stillNeedImage && imageResult) {
        updates['moderation.image.decision'] = imageResult.decision;
        updates['moderation.image.score'] = imageResult.score;
        updates['moderation.image.categories'] = imageResult.categories;
        updates['moderation.image.checkedAt'] = FieldValue.serverTimestamp();
        updates['moderation.image.modelVersion'] = imageResult.modelVersion;
      }

      if (combinedDecision === 'ALLOW') {
        updates.status = 'approved';
        updates.rejectionReason = FieldValue.delete();
      } else if (combinedDecision === 'BLOCK') {
        updates.status = 'rejected';
        const reason =
          (finalImageDecision === 'BLOCK' ? imageRejectionReason : null) ??
          (finalTextDecision === 'BLOCK' ? 'Treść narusza zasady społeczności.' : null) ??
          'Treść narusza zasady społeczności.';
        updates.rejectionReason = reason.slice(0, 240);
      } else {
        // REVIEW: keep pending
        updates.status = 'pending';
      }

      const outcomeType = outcomeEventType(combinedDecision);
      const outcomeDocId = deterministicEventId(eventId, outcomeType);

      const eventsCol = postRef.collection('postEvents');
      const startedRef = eventsCol.doc(startedDocId);
      const outcomeRef = eventsCol.doc(outcomeDocId);

      // Idempotent: use deterministic IDs (set overwrites on retry).
      t.set(startedRef, { type: 'ai_review_started', actorId, createdAt: FieldValue.serverTimestamp() }, { merge: false });
      t.set(outcomeRef, { type: outcomeType, actorId, createdAt: FieldValue.serverTimestamp() }, { merge: false });

      // --- Moderation-related notifications (admin inbox + author) ---
      const userItems = db
        .collection(USER_NOTIFICATIONS_COLLECTION)
        .doc(authorId)
        .collection(USER_NOTIFICATION_ITEMS_SUBCOLLECTION);

      if (combinedDecision === 'REVIEW') {
        const adminRef = db.collection(ADMIN_NOTIFICATIONS_COLLECTION).doc(`review_${postId}`);
        const adminSnap = await t.get(adminRef);

        const categories = mergeCategories(textResult?.categories ?? null, imageResult?.categories ?? null);
        const score = Math.max(textResult?.score ?? 0, imageResult?.score ?? 0);
        const meta: Record<string, unknown> = {
          ...(Object.keys(categories).length ? { categories } : {}),
          ...(Number.isFinite(score) && score > 0 ? { score } : {}),
        };

        if (!adminSnap.exists) {
          t.set(
            adminRef,
            {
              type: 'post_needs_review',
              postId,
              actorId: 'system',
              createdAt: FieldValue.serverTimestamp(),
              read: false,
              ...(Object.keys(meta).length ? { meta } : {}),
            },
            { merge: false },
          );
        } else {
          // Keep it unread (if it was read) and refresh meta; preserve createdAt.
          t.set(adminRef, { read: false, ...(Object.keys(meta).length ? { meta } : {}) }, { merge: true });
        }

        const notifId = userNotificationDocId('post_ai_review', postId);
        const userRef = userItems.doc(notifId);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          t.set(
            userRef,
            {
              type: 'post_ai_review',
              postId,
              actorId: 'system',
              createdAt: FieldValue.serverTimestamp(),
              read: false,
              messagePL: 'Post czeka na ręczną moderację.',
            },
            { merge: false },
          );
        }
      }

      if (combinedDecision === 'ALLOW') {
        const notifId = userNotificationDocId('post_ai_approved', postId);
        const userRef = userItems.doc(notifId);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          t.set(
            userRef,
            {
              type: 'post_ai_approved',
              postId,
              actorId: 'system',
              createdAt: FieldValue.serverTimestamp(),
              read: false,
              messagePL: 'Post został automatycznie zatwierdzony.',
            },
            { merge: false },
          );
        }
      }

      if (combinedDecision === 'BLOCK') {
        const notifId = userNotificationDocId('post_ai_rejected', postId);
        const userRef = userItems.doc(notifId);
        const userSnap = await t.get(userRef);

        const rr = typeof updates.rejectionReason === 'string' ? (updates.rejectionReason as string) : null;
        const reason = rr && rr.trim() ? rr.trim().slice(0, 240) : null;

        if (!userSnap.exists) {
          t.set(
            userRef,
            {
              type: 'post_ai_rejected',
              postId,
              actorId: 'system',
              createdAt: FieldValue.serverTimestamp(),
              read: false,
              messagePL: reason
                ? `Post został odrzucony przez moderację AI. Powód: ${reason}`.slice(0, 240)
                : 'Post został odrzucony przez moderację AI.',
              ...(reason ? { meta: { rejectionReason: reason } } : {}),
            },
            { merge: false },
          );
        }
      }

      t.update(postRef, updates);
    });

    logger.info('[aiModeration] applied', {
      postId,
      eventId,
      textDecision: textResult?.decision ?? 'skipped',
      imageDecision: imageResult?.decision ?? 'skipped',
    });
  } catch (error) {
    // Fail-safe: leave post as pending (transaction failed means no post change).
    logger.error('[aiModeration] transaction_failed', { postId, eventId, error });
  }
}

export const onPostCreatedAiModerateIfPending = onDocumentCreated('posts/{postId}', async (event) => {
  const postId = event.params.postId as string;
  const snap = event.data;
  if (!snap) return;

  const afterData = snap.data() as Record<string, unknown>;
  const status = asPostStatus(afterData.status);
  if (status !== 'pending') return;

  await moderatePostIfNeeded({ postId, eventId: event.id, afterData });
});

export const onPostWrittenAiModerateOnPendingTransition = onDocumentWritten('posts/{postId}', async (event) => {
  const postId = event.params.postId as string;
  const before = event.data?.before;
  const after = event.data?.after;

  // Only care about real updates (avoid create/delete).
  if (!before?.exists || !after?.exists) return;

  const beforeData = before.data() as Record<string, unknown>;
  const afterData = after.data() as Record<string, unknown>;

  const beforeStatus = asPostStatus(beforeData.status);
  const afterStatus = asPostStatus(afterData.status);

  // Only when entering pending (never pending -> pending).
  if (afterStatus === 'pending' && beforeStatus !== 'pending') {
    await moderatePostIfNeeded({ postId, eventId: event.id, afterData });
  }
});


