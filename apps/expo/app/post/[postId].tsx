import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/context/auth';
import {
  addComment,
  deleteComment,
  getComments,
  getPostById,
  getPostEvents,
  toggleLike,
  type Comment,
  type Post,
  type PostEvent,
} from '../../src/services/posts';
import { Avatar } from '../../src/components/Avatar';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { formatTimestampDate } from '../../src/utils/time';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { PostStatusBadge } from '../../src/components/PostStatusBadge';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, shadow, space, typography } from '../../src/theme';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatEventTime(createdAt?: { toDate: () => Date }): string {
  if (!createdAt) return '--:-- --.--';
  const d = createdAt.toDate();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function actorLabel(actorId: string): string {
  return actorId === 'system' ? 'system' : actorId;
}

export default function PostDetailsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [likeUpdating, setLikeUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const likeAnim = useState(() => new Animated.Value(1))[0];

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [postEvents, setPostEvents] = useState<PostEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!postId) return;
      setLoading(true);
      try {
        setError(null);
        const p = await getPostById(postId);
        if (cancelled) return;
        setPost(p);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, retryKey]);

  const refreshComments = async () => {
    if (!postId) return;
    setCommentsLoading(true);
    try {
      const list = await getComments(postId);
      setComments(list);
    } catch (e) {
      console.error(e);
      // keep existing alert for action-level errors, but also allow nicer empty/error rendering
      Alert.alert('Błąd', mapFirestoreErrorToMessage(e, 'Nie udało się pobrać komentarzy.'));
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    refreshComments();
  }, [postId]);

  const onRefresh = async () => {
    if (!postId) return;
    setRefreshing(true);
    try {
      const p = await getPostById(postId);
      setPost(p);
      await refreshComments();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!postId || !isAdmin) return;
    let cancelled = false;

    (async () => {
      setEventsLoading(true);
      try {
        const events = await getPostEvents(postId);
        if (!cancelled) setPostEvents(events);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, isAdmin]);

  const handleLike = async () => {
    if (!post) return;
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby polubić post.');
      return;
    }
    if (likeUpdating) return;

    setLikeUpdating(true);
    likeAnim.setValue(1);
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.12, duration: 90, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const liked = await toggleLike(post.id, user.uid);
      setPost((prev) => {
        if (!prev) return prev;
        return { ...prev, likeCount: liked ? prev.likeCount + 1 : Math.max(0, prev.likeCount - 1) };
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(e, 'Nie udało się polubić posta.'));
    } finally {
      setLikeUpdating(false);
    }
  };

  const handleSend = async () => {
    if (!postId) return;
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby dodać komentarz.');
      return;
    }
    if (!inputText.trim() || submitting) return;

    setSubmitting(true);
    try {
      await addComment(postId, user.uid, inputText.trim());
      setInputText('');
      await refreshComments();
      setPost((prev) => (prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev));
    } catch (error) {
      const code = (error as { code?: string })?.code;
      console.error('Error adding comment:', code, error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się dodać komentarza.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string, authorId: string) => {
    if (!postId) return;
    const canDelete = user?.uid === authorId || isAdmin;
    if (!canDelete) return;

    Alert.alert('Usuń komentarz', 'Czy na pewno chcesz usunąć ten komentarz?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(postId, commentId);
            await refreshComments();
            setPost((prev) => (prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount || 0) - 1) } : prev));
          } catch (e) {
            console.error(e);
            Alert.alert('Błąd', mapFirestoreErrorToMessage(e, 'Nie udało się usunąć komentarza.'));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { padding: 16, width: '100%' }]}>
        <SkeletonBlock height={18} width={180} radius={9} />
        <View style={{ height: 12 }} />
        <SkeletonBlock height={220} width={'100%'} radius={12} />
        <View style={{ height: 12 }} />
        <SkeletonBlock height={14} width={'92%'} radius={7} />
        <View style={{ height: 8 }} />
        <SkeletonBlock height={14} width={'84%'} radius={7} />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
            <Text style={styles.backButtonText}>Wróć</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 60 }} />
        </View>
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
          description={mapFirestoreErrorToMessage(error, 'Nie udało się załadować posta.')}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setRetryKey((x) => x + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
            <Text style={styles.backButtonText}>Wróć</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <EmptyState title="Nie znaleziono posta" description="Możliwe, że został usunięty lub nie masz do niego dostępu." icon="document-text-outline" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <SurfaceCard style={styles.postCard}>
            <TouchableOpacity
              style={styles.postHeader}
              onPress={() => post.authorId && router.push(`/profile/${post.authorId}`)}
              disabled={!post.authorId}
            >
              <Avatar size={40} uri={post.authorAvatarUrl} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>{post.authorName || 'Użytkownik'}</Text>
                <Text style={styles.time}>
                  {formatTimestampDate(post.createdAt, 'Teraz')}
                </Text>
              </View>
            </TouchableOpacity>

            {(isAdmin || user?.uid === post.authorId) && (
              <View style={styles.statusRow}>
                <PostStatusBadge
                  status={post.status}
                  ai={{
                    textDecision: ((post as any)?.moderation?.decision ?? null) as any,
                    imageDecision: ((post as any)?.moderation?.image?.decision ?? null) as any,
                  }}
                />
              </View>
            )}

            {(isAdmin || user?.uid === post.authorId) &&
              post.status === 'rejected' &&
              typeof post.rejectionReason === 'string' &&
              !!post.rejectionReason.trim() && (
                <View style={styles.rejectionBox}>
                  <Text style={styles.rejectionTitle}>Powód odrzucenia</Text>
                  <Text style={styles.rejectionBody}>{post.rejectionReason.trim()}</Text>
                </View>
              )}

            <Text style={styles.content}>{post.text}</Text>
            {post.photoUrl && (
              <Image source={{ uri: post.photoUrl }} style={styles.postImage} resizeMode="cover" />
            )}

            <View style={styles.footer}>
              <View style={styles.interactions}>
                <TouchableOpacity style={styles.interactionButton} onPress={handleLike} disabled={likeUpdating}>
                  <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                    <Ionicons name="heart-outline" size={22} color={colors.textSecondary} />
                  </Animated.View>
                  <Text style={styles.interactionText}>{post.likeCount || 0}</Text>
                </TouchableOpacity>
                <View style={styles.interactionButton}>
                  <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.interactionText}>{post.commentCount || 0}</Text>
                </View>
              </View>
            </View>

            {isAdmin && (
              <View style={styles.eventsContainer}>
                <Text style={styles.eventsTitle}>Post events</Text>
                {eventsLoading ? (
                  <View style={{ marginTop: 8 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <View key={i} style={{ marginBottom: 6 }}>
                        <SkeletonBlock height={12} width={'95%'} radius={6} />
                      </View>
                    ))}
                  </View>
                ) : postEvents.length === 0 ? (
                  <Text style={styles.eventsEmpty}>Brak zdarzeń.</Text>
                ) : (
                  postEvents.map((ev) => (
                    <Text key={ev.id} style={styles.eventRow}>
                      [{formatEventTime(ev.createdAt)}] {actorLabel(ev.actorId)} – {ev.type}
                    </Text>
                  ))
                )}
              </View>
            )}

            <Text style={styles.commentsTitle}>Komentarze</Text>
          </SurfaceCard>
        }
        renderItem={({ item }) => {
          const canDelete = user?.uid === item.authorId || isAdmin;
          return (
            <View style={styles.commentContainer}>
              <View style={styles.commentHeader}>
                <TouchableOpacity
                  style={styles.commentAuthorRow}
                  onPress={() => item.authorId && router.push(`/profile/${item.authorId}`)}
                >
                  <Avatar size={24} uri={item.authorAvatarUrl} />
                  <Text style={styles.commentAuthor}>{item.authorName || 'Użytkownik'}</Text>
                </TouchableOpacity>
                <Text style={styles.commentTime}>
                  {formatTimestampDate(item.createdAt, 'Teraz')}
                </Text>
              </View>
              <Text style={styles.commentText}>{item.text}</Text>
              {canDelete && (
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id, item.authorId)}>
                  <Text style={styles.deleteButtonText}>Usuń</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          commentsLoading ? (
            <View style={{ paddingTop: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.commentContainer}>
                  <SkeletonBlock height={12} width={160} radius={6} />
                  <View style={{ height: 8 }} />
                  <SkeletonBlock height={14} width={'92%'} radius={7} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title="Brak komentarzy" description="Bądź pierwszy i zostaw komentarz." icon="chatbubble-ellipses-outline" />
          )
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.input}
          placeholder={user ? 'Napisz komentarz...' : 'Zaloguj się, aby komentować...'}
          value={inputText}
          onChangeText={setInputText}
          multiline
          editable={!!user && !submitting}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!user || !inputText.trim() || submitting) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!user || !inputText.trim() || submitting}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  backButtonText: {
    ...typography.bodyEmph,
    color: colors.primary,
    marginLeft: 6,
  },
  headerTitle: {
    ...typography.titleLG,
  },
  listContent: {
    padding: space.lg,
    paddingBottom: 90,
  },
  postCard: {
    padding: space.lg,
    marginBottom: space.lg,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: space.md,
  },
  rejectionBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: hairline,
    borderColor: 'rgba(155, 44, 44, 0.20)',
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  rejectionTitle: {
    ...typography.meta,
    color: colors.danger,
    marginBottom: 4,
  },
  rejectionBody: {
    ...typography.body,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
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
    lineHeight: 22,
  },
  postImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    marginBottom: space.md,
    backgroundColor: colors.skeleton,
  },
  footer: {
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    paddingTop: space.md,
    marginBottom: space.md,
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
  commentsTitle: {
    ...typography.titleMD,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  eventsContainer: {
    marginTop: space.sm,
    marginBottom: space.md,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  eventsTitle: {
    ...typography.titleMD,
    marginBottom: space.sm,
  },
  eventsEmpty: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  eventRow: {
    ...typography.micro,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  commentContainer: {
    marginBottom: 12,
    padding: space.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthor: {
    ...typography.bodyEmph,
    fontSize: 13,
    color: colors.text,
    marginLeft: 8,
  },
  commentTime: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  commentText: {
    ...typography.body,
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
  },
  deleteButton: {
    alignSelf: 'flex-end',
    marginTop: 6,
    padding: 5,
  },
  deleteButtonText: {
    ...typography.meta,
    color: colors.danger,
  },
  emptyCommentsText: {
    textAlign: 'center',
    marginTop: 10,
    color: colors.textSecondary,
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    marginRight: space.md,
    maxHeight: 100,
    borderWidth: hairline,
    borderColor: colors.border,
    color: colors.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(31, 61, 43, 0.28)',
  },
});


