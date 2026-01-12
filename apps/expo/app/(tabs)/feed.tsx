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
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  addComment,
  Comment,
  deleteComment,
  getComments,
  getPosts,
  Post,
  toggleLike,
  getPostsByAuthors,
} from '../../src/services/posts';
import { getFollowingIds } from '../../src/services/users';
import { useAuth } from '../../src/context/auth';

export default function FeedScreen() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');
  
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Comment[]>([]);
  const [expandedCommentsLoading, setExpandedCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const fetchPosts = async () => {
    try {
      if (feedType === 'all') {
        const approvedPosts = await getPosts('approved');
        setPosts(approvedPosts);
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
      Alert.alert('Błąd', 'Nie udało się polubić posta.');
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
      Alert.alert('Błąd', 'Nie udało się pobrać komentarzy.');
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
      } else if (code === 'permission-denied') {
        Alert.alert('Błąd', 'Brak uprawnień do dodania komentarza (rules).');
      } else {
        Alert.alert('Błąd', 'Nie udało się dodać komentarza.');
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
      Alert.alert('Błąd', 'Nie udało się usunąć komentarza.');
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
          <View style={styles.avatarPlaceholder} />
          <View>
            <Text style={styles.username}>{item.authorName || 'Użytkownik'}</Text>
            <Text style={styles.time}>
              {item.createdAt?.seconds
                ? new Date(item.createdAt.seconds * 1000).toLocaleDateString()
                : 'Teraz'}
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
                        <TouchableOpacity onPress={() => c.authorId && router.push(`/profile/${c.authorId}`)}>
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
  commentAuthor: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#333',
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
