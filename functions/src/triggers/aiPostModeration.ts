import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { moderateTextWithOpenAI, type AiModerationDecision } from '../services/aiPostModeration';

const db = getFirestore();

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function hasCheckedAt(data: Record<string, unknown>): boolean {
  const moderation = data.moderation;
  if (!moderation || typeof moderation !== 'object') return false;
  const checkedAt = (moderation as Record<string, unknown>).checkedAt;
  return !!checkedAt;
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

async function moderatePostIfNeeded(params: {
  postId: string;
  eventId: string;
  afterData: Record<string, unknown>;
}) {
  const { postId, eventId, afterData } = params;

  const status = asPostStatus(afterData.status);
  if (status !== 'pending') return;
  if (hasCheckedAt(afterData)) return;

  const text = typeof afterData.text === 'string' ? afterData.text : '';
  const title = typeof afterData.title === 'string' ? afterData.title : null; // optional (not in shared model)

  let moderationResult: Awaited<ReturnType<typeof moderateTextWithOpenAI>>;
  try {
    moderationResult = await moderateTextWithOpenAI({ title, text });
  } catch (error) {
    // Fail-safe: never auto-approve on error/timeout; leave as pending.
    logger.error('[aiModeration][trigger] openai_failed', { postId, eventId, error });
    return;
  }

  const startedDocId = deterministicEventId(eventId, 'ai_review_started');
  const outcomeDocId = deterministicEventId(eventId, outcomeEventType(moderationResult.decision));
  const actorId = 'system';

  try {
    await db.runTransaction(async (t) => {
      const postRef = db.collection('posts').doc(postId);
      const postSnap = await t.get(postRef);
      if (!postSnap.exists) return;

      const current = postSnap.data() as Record<string, unknown>;
      const currentStatus = asPostStatus(current.status);
      if (currentStatus !== 'pending') return;
      if (hasCheckedAt(current)) return; // idempotent: already moderated

      const decision = moderationResult.decision;
      const updates: Record<string, unknown> = {
        autoModerated: true,
        updatedAt: FieldValue.serverTimestamp(),
        moderation: {
          decision,
          score: moderationResult.score,
          categories: moderationResult.categories,
          checkedAt: FieldValue.serverTimestamp(),
          modelVersion: moderationResult.modelVersion,
        },
      };

      if (decision === 'ALLOW') {
        updates.status = 'approved';
        updates.rejectionReason = FieldValue.delete();
      } else if (decision === 'BLOCK') {
        updates.status = 'rejected';
        updates.rejectionReason = moderationResult.rejectionReason?.slice(0, 240) ?? 'Treść narusza zasady społeczności.';
      } else {
        // REVIEW: keep pending
        updates.status = 'pending';
      }

      const eventsCol = postRef.collection('postEvents');
      const startedRef = eventsCol.doc(startedDocId);
      const outcomeRef = eventsCol.doc(outcomeDocId);

      // Idempotent: use deterministic IDs (set overwrites on retry).
      t.set(startedRef, { type: 'ai_review_started', actorId, createdAt: FieldValue.serverTimestamp() }, { merge: false });
      t.set(outcomeRef, { type: outcomeEventType(decision), actorId, createdAt: FieldValue.serverTimestamp() }, { merge: false });

      t.update(postRef, updates);
    });

    logger.info('[aiModeration] applied', {
      postId,
      eventId,
      decision: moderationResult.decision,
      score: moderationResult.score,
      modelVersion: moderationResult.modelVersion,
    });
  } catch (error) {
    // Fail-safe: leave post as pending (transaction failed means no post change).
    logger.error('[aiModeration] transaction_failed', { postId, eventId, decision: moderationResult.decision, error });
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


