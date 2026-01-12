import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Trigger on changes to users/{followerId}/following/{followedId}.
 * Maintains consistency for:
 * - users/{followerId}.followingCount
 * - users/{followedId}.followersCount
 */
export const onFollowUser = onDocumentWritten('users/{followerId}/following/{followedId}', async (event) => {
  const { followerId, followedId } = event.params;
  
  // Check if document was created, deleted, or updated
  const beforeExists = event.data?.before.exists;
  const afterExists = event.data?.after.exists;

  const wasCreated = !beforeExists && afterExists;
  const wasDeleted = beforeExists && !afterExists;

  if (!wasCreated && !wasDeleted) {
    // Just an update, maybe nothing to count change
    return;
  }

  const followerRef = db.collection('users').doc(followerId);
  const followedRef = db.collection('users').doc(followedId);

  try {
    logger.info('[onFollowUser] event', {
      followerId,
      followedId,
      action: wasCreated ? 'create' : 'delete',
    });

    await db.runTransaction(async (t) => {
      const followerDoc = await t.get(followerRef);
      const followedDoc = await t.get(followedRef);

      if (!followerDoc.exists || !followedDoc.exists) {
        logger.warn(`User(s) not found: follower=${followerId}, followed=${followedId}`);
        return;
      }

      const currentFollowingCount = typeof followerDoc.data()?.followingCount === 'number' ? followerDoc.data()!.followingCount : 0;
      const currentFollowersCount = typeof followedDoc.data()?.followersCount === 'number' ? followedDoc.data()!.followersCount : 0;

      const nextFollowingCount = wasCreated
        ? currentFollowingCount + 1
        : Math.max(0, currentFollowingCount - 1);

      const nextFollowersCount = wasCreated
        ? currentFollowersCount + 1
        : Math.max(0, currentFollowersCount - 1);

      t.update(followerRef, { followingCount: nextFollowingCount });
      t.update(followedRef, { followersCount: nextFollowersCount });

      logger.info('[onFollowUser] counters', {
        followerId,
        followedId,
        currentFollowingCount,
        nextFollowingCount,
        currentFollowersCount,
        nextFollowersCount,
      });
    });
    logger.info(
      `Successfully handled follow/unfollow: ${followerId} -> ${followedId} (${
        wasCreated ? 'Follow' : 'Unfollow'
      })`
    );
  } catch (error) {
    logger.error('Error in onFollowUser trigger:', error);
    throw error; // Retry on failure
  }
});
