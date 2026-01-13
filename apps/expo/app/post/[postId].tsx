import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/auth';
import { addComment, deleteComment, getComments, getPostById, toggleLike, type Comment, type Post } from '../../src/services/posts';

export default function PostDetailsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [likeUpdating, setLikeUpdating] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!postId) return;
      setLoading(true);
      const p = await getPostById(postId);
      if (cancelled) return;
      setPost(p);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const refreshComments = async () => {
    if (!postId) return;
    setCommentsLoading(true);
    try {
      const list = await getComments(postId);
      setComments(list);
    } catch (e) {
      console.error(e);
      Alert.alert('Błąd', 'Nie udało się pobrać komentarzy.');
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    refreshComments();
  }, [postId]);

  const handleLike = async () => {
    if (!post) return;
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby polubić post.');
      return;
    }
    if (likeUpdating) return;

    setLikeUpdating(true);
    try {
      const liked = await toggleLike(post.id, user.uid);
      setPost((prev) => {
        if (!prev) return prev;
        return { ...prev, likeCount: liked ? prev.likeCount + 1 : Math.max(0, prev.likeCount - 1) };
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Błąd', 'Nie udało się polubić posta.');
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
      Alert.alert('Błąd', 'Nie udało się dodać komentarza.');
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
            Alert.alert('Błąd', 'Nie udało się usunąć komentarza.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
            <Text style={styles.backButtonText}>Wróć</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text>Nie znaleziono posta.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.postCard}>
            <TouchableOpacity
              style={styles.postHeader}
              onPress={() => post.authorId && router.push(`/profile/${post.authorId}`)}
              disabled={!post.authorId}
            >
              <View style={styles.avatarPlaceholder} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>{post.authorName || 'Użytkownik'}</Text>
                <Text style={styles.time}>
                  {post.createdAt?.seconds
                    ? new Date(post.createdAt.seconds * 1000).toLocaleDateString()
                    : 'Teraz'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.content}>{post.text}</Text>
            {post.photoUrl && (
              <Image source={{ uri: post.photoUrl }} style={styles.postImage} resizeMode="cover" />
            )}

            <View style={styles.footer}>
              <View style={styles.interactions}>
                <TouchableOpacity style={styles.interactionButton} onPress={handleLike} disabled={likeUpdating}>
                  <Ionicons name="heart-outline" size={24} color="#333" />
                  <Text style={styles.interactionText}>{post.likeCount || 0}</Text>
                </TouchableOpacity>
                <View style={styles.interactionButton}>
                  <Ionicons name="chatbubble-outline" size={22} color="#333" />
                  <Text style={styles.interactionText}>{post.commentCount || 0}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.commentsTitle}>Komentarze</Text>
          </View>
        }
        renderItem={({ item }) => {
          const canDelete = user?.uid === item.authorId || isAdmin;
          return (
            <View style={styles.commentContainer}>
              <View style={styles.commentHeader}>
                <TouchableOpacity onPress={() => item.authorId && router.push(`/profile/${item.authorId}`)}>
                  <Text style={styles.commentAuthor}>{item.authorName || 'Użytkownik'}</Text>
                </TouchableOpacity>
                <Text style={styles.commentTime}>
                  {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Teraz'}
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
            <ActivityIndicator size="small" color="#007AFF" style={{ marginTop: 10 }} />
          ) : (
            <Text style={styles.emptyCommentsText}>Brak komentarzy. Bądź pierwszy!</Text>
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
    backgroundColor: '#fff',
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
    paddingBottom: 90,
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 0,
    marginBottom: 10,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ddd',
    marginRight: 10,
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
    height: 220,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eee',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
    marginBottom: 10,
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
  commentsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
  },
  commentContainer: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  commentAuthor: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
  },
  commentTime: {
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
    marginTop: 6,
    padding: 5,
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 12,
  },
  emptyCommentsText: {
    textAlign: 'center',
    marginTop: 10,
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
});


