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
import * as Haptics from 'expo-haptics';
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
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { classifyFirestoreError } from '../../src/utils/firestoreErrors';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, shadow, space, typography } from '../../src/theme';

export default function FeedScreen() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
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

  // Like micro-interaction (single animated value is enough; we only "pop" the latest pressed post)
  const likeAnim = useRef(new Animated.Value(1)).current;
  const [likeAnimPostId, setLikeAnimPostId] = useState<string | null>(null);

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
    const missing = actorIds.filter((id) => id !== 'system' && !actorCache[id]);
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

    markNotificationsRead(user.uid, unreadIds).catch((e) => {
      console.warn('Failed to mark notifications read:', e);
    });
  }, [notifVisible, notifications, user?.uid]);

  const fetchPosts = async () => {
    try {
      setError(null);
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
      setError(error);
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

    // micro-interaction: haptic + pop
    setLikeAnimPostId(post.id);
    likeAnim.setValue(1);
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.12, duration: 90, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

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
      <SurfaceCard style={styles.postContainer}>
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
              <Animated.View style={{ transform: [{ scale: item.id === likeAnimPostId ? likeAnim : 1 }] }}>
                <Ionicons name="heart-outline" size={22} color={colors.textSecondary} />
              </Animated.View>
              <Text style={styles.interactionText}>{item.likeCount || 0}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.interactionButton} onPress={() => toggleComments(item.id)}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.interactionText}>{item.commentCount || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.commentsSection}>
            {expandedCommentsLoading ? (
              <View style={{ paddingVertical: 6 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={[styles.commentRow, { backgroundColor: colors.surface }]}>
                    <SkeletonBlock height={12} width={140} radius={6} />
                    <View style={{ height: 8 }} />
                    <SkeletonBlock height={14} width={'92%'} radius={7} />
                  </View>
                ))}
              </View>
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
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SurfaceCard>
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
          <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
          {unreadCount > 0 && (
            <View style={styles.notificationsBadge}>
              <Text style={styles.notificationsBadgeText}>{unreadCount >= 10 ? '9+' : String(unreadCount)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SurfaceCard key={i} style={[styles.postContainer, { padding: 15 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <SkeletonBlock height={40} width={40} radius={20} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <SkeletonBlock height={14} width={140} radius={7} />
                  <View style={{ height: 6 }} />
                  <SkeletonBlock height={12} width={90} radius={6} />
                </View>
              </View>
              <SkeletonBlock height={14} width={'96%'} radius={7} />
              <View style={{ height: 8 }} />
              <SkeletonBlock height={14} width={'84%'} radius={7} />
              <View style={{ height: 10 }} />
              <SkeletonBlock height={200} width={'100%'} radius={8} />
            </SurfaceCard>
          ))}
        </View>
      ) : error ? (
        <ErrorState
          kind={
            classifyFirestoreError(error) === 'offline'
              ? 'offline'
              : classifyFirestoreError(error) === 'permission'
                ? 'permission'
                : classifyFirestoreError(error) === 'timeout'
                  ? 'timeout'
                  : 'unknown'
          }
          title={
            classifyFirestoreError(error) === 'offline'
              ? 'Brak internetu'
              : classifyFirestoreError(error) === 'permission'
                ? 'Brak uprawnień'
                : classifyFirestoreError(error) === 'timeout'
                  ? 'Przekroczono czas oczekiwania'
                  : 'Coś poszło nie tak'
          }
          description={mapFirestoreErrorToMessage(error, 'Nie udało się załadować feedu.')}
          onRetry={() => {
            setLoading(true);
            fetchPosts();
          }}
        />
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
              <ActivityIndicator size="small" color={colors.primary2} style={{ marginVertical: 12 }} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title="Brak postów"
              description={
                feedType === 'following'
                  ? 'Nie obserwujesz nikogo lub obserwowani nie dodali postów.'
                  : 'Jeszcze nie ma postów. Bądź pierwszy!'
              }
              icon="images-outline"
            />
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
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!user ? (
              <EmptyState title="Powiadomienia" description="Zaloguj się, aby zobaczyć powiadomienia." icon="notifications-outline" />
            ) : notifications.length === 0 ? (
              <EmptyState title="Brak powiadomień" description="Gdy coś się wydarzy, zobaczysz to tutaj." icon="notifications-outline" />
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                contentContainerStyle={styles.sheetListContent}
                renderItem={({ item: n }) => {
                  const username = actorCache[n.actorId]?.username;
                  const actorLabel = n.actorId === 'system' ? 'System' : username ? `@${username}` : 'Użytkownik';

                  const message =
                    typeof n.messagePL === 'string' && n.messagePL.trim()
                      ? n.messagePL.trim()
                      : n.type === 'follow'
                        ? `${actorLabel} zaczął/a Cię obserwować`
                        : n.type === 'like'
                          ? `${actorLabel} polubił/a Twój post`
                          : n.type === 'comment'
                            ? `${actorLabel} skomentował/a Twój post`
                            : 'Masz nowe powiadomienie.';

                  const dateLabel = formatTimestampDate(n.createdAt, 'Teraz');

                  const onPress = async () => {
                    // Optimistic UI update so it doesn't keep showing as unread.
                    if (!n.read) {
                      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                    }
                    try {
                      if (!n.read && user?.uid) await markNotificationRead(user.uid, n.id);
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
                    <TouchableOpacity style={[styles.notifRow, n.read && { opacity: 0.68 }]} onPress={onPress}>
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
    backgroundColor: colors.bg,
  },
  topBar: {
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    alignItems: 'center',
    position: 'relative',
  },
  appTitle: {
    ...typography.titleXL,
    color: colors.primary,
    marginBottom: space.sm,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  notificationsButton: {
    position: 'absolute',
    right: space.lg,
    top: space.lg,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
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
    backgroundColor: colors.primary,
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
    paddingVertical: 7,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
  toggleButtonActive: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairline,
    borderColor: colors.border,
    ...shadow.card,
  },
  toggleText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  loader: {
    marginTop: 20,
  },
  listContent: {
    padding: space.lg,
    paddingBottom: space['2xl'],
  },
  postContainer: {
    marginBottom: space.lg,
    padding: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  username: {
    ...typography.titleMD,
  },
  time: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  content: {
    ...typography.body,
    fontSize: 15,
    marginBottom: space.md,
    color: colors.text,
    lineHeight: 22,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: space.md,
    backgroundColor: colors.skeleton,
  },
  footer: {
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  interactions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: space.xl,
  },
  interactionText: {
    marginLeft: 6,
    ...typography.meta,
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheetContainer: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 10,
    overflow: 'hidden',
    ...shadow.floating,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    ...typography.titleLG,
  },
  sheetEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetEmptyText: {
    ...typography.body,
    color: colors.textSecondary,
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
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  notifAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.skeleton,
    borderWidth: hairline,
    borderColor: colors.border,
    marginRight: 12,
  },
  notifBody: {
    flex: 1,
  },
  notifText: {
    ...typography.body,
    color: colors.text,
  },
  notifTextUnread: {
    fontWeight: '700',
  },
  notifTime: {
    marginTop: 2,
    ...typography.micro,
    color: colors.textTertiary,
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 10,
  },
  commentsSection: {
    marginTop: 10,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  commentsLoader: {
    paddingVertical: 6,
  },
  emptyCommentsText: {
    ...typography.meta,
    color: colors.textTertiary,
    paddingVertical: 6,
  },
  commentsList: {
    marginBottom: 10,
  },
  commentRow: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
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
    ...typography.meta,
    color: colors.text,
    marginLeft: 8,
  },
  commentDelete: {
    ...typography.meta,
    color: colors.danger,
  },
  commentText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 19,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    marginRight: space.md,
    maxHeight: 100,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendButtonDisabled: {
    backgroundColor: 'rgba(31, 61, 43, 0.28)',
  },
});
