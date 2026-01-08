/**
 * Firestore collection + subcollection names (single source of truth).
 * Keep these in sync with your Firestore rules and backend logic.
 */
export const COLLECTIONS = {
  users: 'users',
  posts: 'posts',
  postEvents: 'postEvents',
} as const;

export const SUBCOLLECTIONS = {
  likes: 'likes',
  comments: 'comments',
} as const;

/**
 * String path helpers for documents/collections.
 * Useful for audit logs, rules testing, and keeping paths consistent.
 */
export const paths = {
  users: () => COLLECTIONS.users,
  user: (uid: string) => `${COLLECTIONS.users}/${uid}`,

  posts: () => COLLECTIONS.posts,
  post: (postId: string) => `${COLLECTIONS.posts}/${postId}`,

  postLikes: (postId: string) => `${COLLECTIONS.posts}/${postId}/${SUBCOLLECTIONS.likes}`,
  postLike: (postId: string, uid: string) =>
    `${COLLECTIONS.posts}/${postId}/${SUBCOLLECTIONS.likes}/${uid}`,

  postComments: (postId: string) => `${COLLECTIONS.posts}/${postId}/${SUBCOLLECTIONS.comments}`,
  postComment: (postId: string, commentId: string) =>
    `${COLLECTIONS.posts}/${postId}/${SUBCOLLECTIONS.comments}/${commentId}`,

  postEvents: () => COLLECTIONS.postEvents,
  postEvent: (eventId: string) => `${COLLECTIONS.postEvents}/${eventId}`,
} as const;
