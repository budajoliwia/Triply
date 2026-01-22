import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentSnapshot } from 'firebase/firestore';
import { getCommentsPage, addComment, deleteComment, Comment } from '../../src/services/posts';
import { useAuth } from '../../src/context/auth';
import { Avatar } from '../../src/components/Avatar';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { formatTimestampDate } from '../../src/utils/time';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { colors, hairline, radius, space, typography } from '../../src/theme';

export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchCommentsFirstPage();
  }, [postId]);

  const fetchCommentsFirstPage = async () => {
    if (!postId) return;
    try {
      setError(null);
      setHasMore(true);
      setLastDoc(null);
      const { comments: pageComments, lastDoc: nextLastDoc, hasMore: nextHasMore } =
        await getCommentsPage(postId, { limit: 20, lastDoc: null });
      setComments(pageComments);
      setLastDoc(nextLastDoc);
      setHasMore(nextHasMore);
    } catch (error) {
      console.error(error);
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!postId) return;
    setRefreshing(true);
    try {
      await fetchCommentsFirstPage();
    } finally {
      setRefreshing(false);
    }
  };

  const loadMoreComments = async () => {
    if (!postId) return;
    if (loading || refreshing) return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (!lastDoc) return;

    setLoadingMore(true);
    try {
      setError(null);
      const { comments: pageComments, lastDoc: nextLastDoc, hasMore: nextHasMore } =
        await getCommentsPage(postId, { limit: 20, lastDoc });

      setComments((current) => {
        if (pageComments.length === 0) return current;
        const seen = new Set(current.map((c) => c.id));
        const deduped = pageComments.filter((c) => !seen.has(c.id));
        return deduped.length ? [...current, ...deduped] : current;
      });

      setLastDoc(nextLastDoc);
      setHasMore(nextHasMore);
    } catch (e) {
      console.error(e);
      setError(e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby dodać komentarz.');
      return;
    }
    if (!inputText.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      await addComment(postId!, user.uid, inputText.trim());
      setInputText('');
      await fetchCommentsFirstPage(); // Refresh list
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się dodać komentarza.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    Alert.alert('Usuń komentarz', 'Czy na pewno chcesz usunąć ten komentarz?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(postId!, commentId);
            await fetchCommentsFirstPage(); // Refresh list
            Alert.alert('Sukces', 'Komentarz został usunięty.');
          } catch (error) {
            console.error(error);
            Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się usunąć komentarza.'));
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Comment }) => {
    const isOwner = user?.uid === item.authorId;
    const canDelete = isOwner || isAdmin;

    return (
      <View style={styles.commentContainer}>
        <View style={styles.commentHeader}>
          <TouchableOpacity
            style={styles.authorRow}
            onPress={() => item.authorId && router.push(`/profile/${item.authorId}`)}
          >
            <Avatar size={24} uri={item.authorAvatarUrl} />
            <Text style={styles.username}>{item.authorName || 'Użytkownik'}</Text>
          </TouchableOpacity>
          <Text style={styles.timestamp}>
            {formatTimestampDate(item.createdAt, 'Teraz')}
          </Text>
        </View>
        <Text style={styles.commentText}>{item.text}</Text>
        
        {canDelete && (
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={() => handleDelete(item.id)}
          >
            <Text style={styles.deleteButtonText}>Usuń</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Komentarze</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={comments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ marginTop: 10 }}>
              <SkeletonBlock height={12} width={'92%'} radius={6} />
              <View style={{ height: 8 }} />
              <SkeletonBlock height={12} width={'86%'} radius={6} />
            </View>
          ) : hasMore && comments.length > 0 ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreComments}>
              <Text style={styles.loadMoreText}>Załaduj więcej komentarzy</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.commentContainer}>
                  <SkeletonBlock height={12} width={180} radius={6} />
                  <View style={{ height: 8 }} />
                  <SkeletonBlock height={14} width={'92%'} radius={7} />
                </View>
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
              description={mapFirestoreErrorToMessage(error, 'Nie udało się pobrać komentarzy.')}
              onRetry={fetchCommentsFirstPage}
            />
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
          style={[styles.sendButton, (!inputText.trim() || submitting) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!user || !inputText.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
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
    paddingBottom: 80,
  },
  commentContainer: {
    marginBottom: 15,
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
    alignItems: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    ...typography.bodyEmph,
    fontSize: 13,
    color: colors.text,
    marginLeft: 8,
  },
  timestamp: {
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
    marginTop: 5,
    padding: 5,
  },
  deleteButtonText: {
    ...typography.meta,
    color: colors.danger,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
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
  loadMoreButton: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  loadMoreText: {
    ...typography.meta,
    color: colors.primary,
  },
  loadMoreSpinner: {
    marginTop: 10,
    marginBottom: 6,
  },
});

