import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentSnapshot } from 'firebase/firestore';
import {
  addComment,
  Comment,
  deleteComment,
  getComments,
  getApprovedPostsPage,
  Post,
  toggleLike,
  getPostsByAuthors,
} from '../../src/services/posts';
import { getFollowingIds, getUserProfilesByIds } from '../../src/services/users';
import { useAuth } from '../../src/context/auth';
import { Avatar } from '../../src/components/Avatar';
import {
  markNotificationRead,
  markNotificationsRead,
  subscribeNotifications,
  subscribeUnreadCount,
  type Notification,
} from '../../src/services/notifications';
import { mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { formatTimestampDate } from '../../src/utils/time';

export default function FeedScreen() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');

  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Comment[]>([]);
  const [expandedCommentsLoading, setExpandedCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // --- Notifications (in-app, no push) ---
  const [notifVisible, setNotifVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actorCache, setActorCache] = useState<Record<string, { username?: string }>>({});
  const markedThisOpenRef = useRef(false);

  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const sheetHeight = useMemo(() => {
    const h = Dimensions.get('window').height;
    return Math.min(620, Math.max(420, Math.floor(h * 0.75)));
  }, []);

  const openNotifications = useCallback(() => {
    setNotifVisible(true);
    markedThisOpenRef.current = false;
    Animated.timing(sheetAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [sheetAnim]);

  const closeNotifications = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setNotifVisible(false);
    });
  }, [sheetAnim]);

  const sheetTranslateY = useMemo(
    () =>
      sheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [sheetHeight, 0],
      }),
    [sheetAnim, sheetHeight],
  );

  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }
    return subscribeUnreadCount(
      user.uid,
      (count) => setUnreadCount(count),
      (error) => console.warn('Unread notifications listener error:', error),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !notifVisible) {
      setNotifications([]);
      return;
    }
    return subscribeNotifications(
      user.uid,
      { limit: 30 },
      (items) => setNotifications(items),
      (error) => console.warn('Notifications listener error:', error),
    );
  }, [user?.uid, notifVisible]);

  useEffect(() => {
    const actorIds = Array.from(new Set(notifications.map((n) => n.actorId).filter(Boolean)));
    const missing = actorIds.filter((id) => !actorCache[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const map = await getUserProfilesByIds(missing);
      if (cancelled) return;
      setActorCache((prev) => {
        const next = { ...prev };
        map.forEach((profile, id) => {
          next[id] = { username: profile.username };
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [notifications, actorCache]);

  // Mark visible notifications as read once per open.
  useEffect(() => {
    if (!notifVisible || !user?.uid) return;
    if (markedThisOpenRef.current) return;
    if (notifications.length === 0) return;

    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) {
      markedThisOpenRef.current = true;
      return;
    }
    markedThisOpenRef.current = true;

    markNotificationsRead(unreadIds).catch((e) => {
      console.warn('Failed to mark notifications read:', e);
    });
  }, [notifVisible, notifications, user?.uid]);

  const fetchPosts = async () => {
    try {
      if (feedType === 'all') {
        const { posts: pagePosts, lastDoc: nextLastDoc, hasMore: nextHasMore } =
          await getApprovedPostsPage({ limit: 10, lastDoc: null });
        setPosts(pagePosts);
        setLastDoc(nextLastDoc);
        setHasMore(nextHasMore);
        setLoadingMore(false);
      } else {
        if (!user) {
          setPosts([]);
        } else {
          const followingIds = await getFollowingIds(user.uid);
          if (followingIds.length === 0) {
            setPosts([]);
          } else {
            const followingPosts = await getPostsByAuthors(followingIds);
            setPosts(followingPosts);
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPosts();
  }, [feedType, user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  const loadMore = useCallback(async () => {
    if (feedType !== 'all') return;
    if (loading || refreshing) return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (!lastDoc) return;

    setLoadingMore(true);
    try {
      const { posts: pagePosts, lastDoc: nextLastDoc, hasMore: nextHasMore } =
        await getApprovedPostsPage({ limit: 10, lastDoc });

      setPosts((current) => {
        if (pagePosts.length === 0) return current;
        const seen = new Set(current.map((p) => p.id));
        const deduped = pagePosts.filter((p) => !seen.has(p.id));
        return deduped.length ? [...current, ...deduped] : current;
      });

      setLastDoc(nextLastDoc);
      setHasMore(nextHasMore);
    } catch (e) {
      console.error(e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [feedType, loading, refreshing, loadingMore, hasMore, lastDoc]);

  const handleLike = async (post: Post) => {
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby polubić post.');
      return;
    }

    try {
      const liked = await toggleLike(post.id, user.uid);

      setPosts((currentPosts) =>
        currentPosts.map((p) =>
          p.id === post.id
            ? { ...p, likeCount: liked ? p.likeCount + 1 : Math.max(0, p.likeCount - 1) }
            : p,
        ),
      );
    } catch (error) {
      console.error('Error liking post:', error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się polubić posta.'));
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      setExpandedComments([]);
      setCommentInput('');
      return;
    }

    setExpandedPostId(postId);
    setExpandedCommentsLoading(true);
    setCommentInput('');
    try {
      const comments = await getComments(postId);
      // Ensure we're still on the same expanded post (user may have toggled quickly)
      setExpandedComments(comments);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się pobrać komentarzy.'));
      setExpandedComments([]);
    } finally {
      setExpandedCommentsLoading(false);
    }
  };

  const handleSendComment = async (post: Post) => {
    if (!expandedPostId || expandedPostId !== post.id) return;
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby dodać komentarz.');
      return;
    }
    if (!commentInput.trim() || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      await addComment(post.id, user.uid, commentInput.trim());
      setCommentInput('');

      // Optimistic counter update for immediate UI feedback
      setPosts((current) =>
        current.map((p) =>
          p.id === post.id ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p,
        ),
      );

      const comments = await getComments(post.id);
      setExpandedComments(comments);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      console.error('Error adding comment:', code, message, error);
      if (code === 'post/not-found') {
        Alert.alert('Błąd', 'Post nie istnieje lub został usunięty.');
      } else {
        Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się dodać komentarza.'));
      }
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (post: Post, commentId: string) => {
    if (!expandedPostId || expandedPostId !== post.id) return;
    try {
      await deleteComment(post.id, commentId);

      // Optimistic counter update (server also decrements in transaction)
      setPosts((current) =>
        current.map((p) =>
          p.id === post.id ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) - 1) } : p,
        ),
      );

      const comments = await getComments(post.id);
      setExpandedComments(comments);
      Alert.alert('Sukces', 'Komentarz został usunięty.');
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się usunąć komentarza.'));
    }
  };

  const renderItem = ({ item }: { item: Post }) => {
    const isExpanded = expandedPostId === item.id;

    return (
      <View style={styles.postContainer}>
        <TouchableOpacity
          style={styles.header}
          onPress={() => item.authorId && router.push(`/profile/${item.authorId}`)}
          disabled={!item.authorId}
        >
          <Avatar size={40} uri={item.authorAvatarUrl} />
          <View>
            <Text style={styles.username}>{item.authorName || 'Użytkownik'}</Text>
            <Text style={styles.time}>
              {formatTimestampDate(item.createdAt, 'Teraz')}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.content}>{item.text}</Text>

        {item.photoUrl && (
          <Image source={{ uri: item.photoUrl }} style={styles.postImage} resizeMode="cover" />
        )}

        <View style={styles.footer}>
          <View style={styles.interactions}>
            <TouchableOpacity style={styles.interactionButton} onPress={() => handleLike(item)}>
              <Ionicons name="heart-outline" size={24} color="#333" />
              <Text style={styles.interactionText}>{item.likeCount || 0}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.interactionButton} onPress={() => toggleComments(item.id)}>
              <Ionicons name="chatbubble-outline" size={22} color="#333" />
              <Text style={styles.interactionText}>{item.commentCount || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.commentsSection}>
            {expandedCommentsLoading ? (
              <ActivityIndicator size="small" color="#007AFF" style={styles.commentsLoader} />
            ) : expandedComments.length === 0 ? (
              <Text style={styles.emptyCommentsText}>Brak komentarzy. Bądź pierwszy!</Text>
            ) : (
              <View style={styles.commentsList}>
                {expandedComments.map((c) => {
                  const canDelete = user?.uid === c.authorId || isAdmin;
                  return (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={styles.commentHeaderRow}>
                        <TouchableOpacity
                          style={styles.commentAuthorRow}
                          onPress={() => c.authorId && router.push(`/profile/${c.authorId}`)}
                        >
                          <Avatar size={24} uri={c.authorAvatarUrl} />
                          <Text style={styles.commentAuthor}>{c.authorName || 'Użytkownik'}</Text>
                        </TouchableOpacity>
                        {canDelete && (
                          <TouchableOpacity onPress={() => handleDeleteComment(item, c.id)}>
                            <Text style={styles.commentDelete}>Usuń</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.commentText}>{c.text}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder={user ? 'Napisz komentarz...' : 'Zaloguj się, aby komentować...'}
                value={commentInput}
                onChangeText={setCommentInput}
                editable={!!user && !commentSubmitting}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.commentSendButton,
                  (!user || !commentInput.trim() || commentSubmitting) && styles.commentSendButtonDisabled,
                ]}
                onPress={() => handleSendComment(item)}
                disabled={!user || !commentInput.trim() || commentSubmitting}
              >
                {commentSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>Triply</Text>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            onPress={() => setFeedType('all')}
            style={[styles.toggleButton, feedType === 'all' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, feedType === 'all' && styles.toggleTextActive]}>
              Wszystkie
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!user) {
                Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby zobaczyć obserwowane.');
                return;
              }
              setFeedType('following');
            }}
            style={[styles.toggleButton, feedType === 'following' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, feedType === 'following' && styles.toggleTextActive]}>
              Obserwowane
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.notificationsButton}
          onPress={openNotifications}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="notifications-outline" size={22} color="#333" />
          {unreadCount > 0 && (
            <View style={styles.notificationsBadge}>
              <Text style={styles.notificationsBadgeText}>{unreadCount >= 10 ? '9+' : String(unreadCount)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            feedType === 'all' && loadingMore ? (
              <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 12 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {feedType === 'following'
                  ? 'Nie obserwujesz nikogo lub obserwowani nie dodali postów.'
                  : 'Brak postów. Bądź pierwszy!'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={notifVisible} transparent animationType="none" onRequestClose={closeNotifications}>
        <View style={styles.sheetOverlay}>
          <TouchableWithoutFeedback onPress={closeNotifications}>
            <View style={styles.sheetBackdrop} />
          </TouchableWithoutFeedback>

          <Animated.View style={[styles.sheetContainer, { height: sheetHeight, transform: [{ translateY: sheetTranslateY }] }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Powiadomienia</Text>
              <TouchableOpacity
                onPress={closeNotifications}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {!user ? (
              <View style={styles.sheetEmpty}>
                <Text style={styles.sheetEmptyText}>Zaloguj się, aby zobaczyć powiadomienia.</Text>
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Text style={styles.sheetEmptyText}>Brak powiadomień.</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                contentContainerStyle={styles.sheetListContent}
                renderItem={({ item: n }) => {
                  const username = actorCache[n.actorId]?.username;
                  const actorLabel = username ? `@${username}` : 'Użytkownik';

                  const message =
                    n.type === 'follow'
                      ? `${actorLabel} zaczął/a Cię obserwować`
                      : n.type === 'like'
                        ? `${actorLabel} polubił/a Twój post`
                        : `${actorLabel} skomentował/a Twój post`;

                  const dateLabel = formatTimestampDate(n.createdAt, 'Teraz');

                  const onPress = async () => {
                    // Optimistic UI update so it doesn't keep showing as unread.
                    if (!n.read) {
                      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                    }
                    try {
                      if (!n.read) await markNotificationRead(n.id);
                    } catch (e) {
                      console.warn('Failed to mark notification read:', e);
                      // revert on failure
                      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
                    }

                    closeNotifications();
                    if (n.type === 'follow') {
                      router.push(`/profile/${n.actorId}`);
                      return;
                    }
                    if (n.postId) {
                      router.push(`/post/${n.postId}`);
                    }
                  };

                  return (
                    <TouchableOpacity style={styles.notifRow} onPress={onPress}>
                      <View style={styles.notifAvatar} />
                      <View style={styles.notifBody}>
                        <Text style={[styles.notifText, !n.read && styles.notifTextUnread]} numberOfLines={2}>
                          {message}
                        </Text>
                        <Text style={styles.notifTime}>{dateLabel}</Text>
                      </View>
                      {!n.read && <View style={styles.notifUnreadDot} />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  topBar: {
    backgroundColor: '#fff',
    padding: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
    position: 'relative',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 10,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    padding: 2,
  },
  notificationsButton: {
    position: 'absolute',
    right: 15,
    top: 15,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationsBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 15,
    borderRadius: 18,
  },
  toggleButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  toggleText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  loader: {
    marginTop: 20,
  },
  listContent: {
    padding: 10,
    paddingBottom: 20,
  },
  postContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  username: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  time: {
    color: '#888',
    fontSize: 12,
  },
  content: {
    fontSize: 15,
    marginBottom: 10,
    lineHeight: 22,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eee',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  interactions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  interactionText: {
    marginLeft: 5,
    color: '#666',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  sheetEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetEmptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  sheetListContent: {
    paddingVertical: 8,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  notifAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ddd',
    marginRight: 12,
  },
  notifBody: {
    flex: 1,
  },
  notifText: {
    color: '#222',
    fontSize: 14,
  },
  notifTextUnread: {
    fontWeight: '700',
  },
  notifTime: {
    marginTop: 2,
    color: '#888',
    fontSize: 12,
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginLeft: 10,
  },
  commentsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  commentsLoader: {
    paddingVertical: 6,
  },
  emptyCommentsText: {
    color: '#888',
    fontSize: 13,
    paddingVertical: 6,
  },
  commentsList: {
    marginBottom: 10,
  },
  commentRow: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthor: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#333',
    marginLeft: 8,
  },
  commentDelete: {
    color: '#ff4444',
    fontSize: 12,
  },
  commentText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 19,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});
