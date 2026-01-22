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
import { mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { formatTimestampDate } from '../../src/utils/time';

export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      setHasMore(true);
      setLastDoc(null);
      const { comments: pageComments, lastDoc: nextLastDoc, hasMore: nextHasMore } =
        await getCommentsPage(postId, { limit: 20, lastDoc: null });
      setComments(pageComments);
      setLastDoc(nextLastDoc);
      setHasMore(nextHasMore);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się pobrać komentarzy.'));
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
      Alert.alert('Błąd', mapFirestoreErrorToMessage(e, 'Nie udało się pobrać kolejnych komentarzy.'));
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
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
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
            <ActivityIndicator size="small" color="#007AFF" style={styles.loadMoreSpinner} />
          ) : hasMore && comments.length > 0 ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreComments}>
              <Text style={styles.loadMoreText}>Załaduj więcej komentarzy</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
          ) : (
            <Text style={styles.emptyText}>Brak komentarzy. Bądź pierwszy!</Text>
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
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  backButtonText: {
    color: '#007AFF',
    marginLeft: 5,
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15,
    paddingBottom: 80,
  },
  commentContainer: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
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
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  commentText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 20,
  },
  deleteButton: {
    alignSelf: 'flex-end',
    marginTop: 5,
    padding: 5,
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: '#888',
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loadMoreButton: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
  },
  loadMoreText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },
  loadMoreSpinner: {
    marginTop: 10,
    marginBottom: 6,
  },
});

