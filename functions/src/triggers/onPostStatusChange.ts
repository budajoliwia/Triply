import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asPostStatus(value: unknown): PostStatus | null {
  if (value === 'draft' || value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return null;
}

async function addPostEvent(params: { postId: string; type: string; actorId: string }) {
  const { postId, type, actorId } = params;
  await db
    .collection('posts')
    .doc(postId)
    .collection('postEvents')
    .add({
      type,
      actorId,
      createdAt: FieldValue.serverTimestamp(),
    });
}

export const onPostCreatedWriteEvents = onDocumentCreated('posts/{postId}', async (event) => {
  const postId = event.params.postId as string;
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() as Record<string, unknown>;
  const authorId = asString(data.authorId) ?? 'system';
  const status = asPostStatus(data.status);

  try {
    await addPostEvent({ postId, type: 'created', actorId: authorId });

    // Current client creates posts directly as `pending`, so treat that as a submission too.
    if (status === 'pending') {
      await addPostEvent({ postId, type: 'submitted', actorId: authorId });
    }
  } catch (error) {
    logger.error('[postEvents][create] failed', { postId, error });
    throw error; // retry
  }
});

export const onPostWrittenWriteSubmittedEvent = onDocumentWritten('posts/{postId}', async (event) => {
  const postId = event.params.postId as string;
  const before = event.data?.before;
  const after = event.data?.after;

  // Only care about real updates (avoid create/delete).
  if (!before?.exists || !after?.exists) return;

  const beforeData = before.data() as Record<string, unknown>;
  const afterData = after.data() as Record<string, unknown>;

  const beforeStatus = asPostStatus(beforeData.status);
  const afterStatus = asPostStatus(afterData.status);

  // Log `submitted` only when the post *enters* pending (never pending -> pending).
  if (afterStatus === 'pending' && beforeStatus !== 'pending') {
    const actorId = asString(afterData.authorId) ?? 'system';
    try {
      await addPostEvent({ postId, type: 'submitted', actorId });
    } catch (error) {
      logger.error('[postEvents][submitted] failed', { postId, error });
      throw error; // retry
    }
  }
});
