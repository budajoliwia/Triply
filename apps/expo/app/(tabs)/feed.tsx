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
} from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getPosts, Post, toggleLike } from '../../src/services/posts';
import { useAuth } from '../../src/context/auth';

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = async () => {
    try {
      const approvedPosts = await getPosts('approved');
      setPosts(approvedPosts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  const handleLike = async (post: Post) => {
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby polubić post.');
      return;
    }

    // Optimistic update
    // We don't know the exact like state here without fetching, but we can assume for now
    // In a real app, we'd check if the user already liked it from a subcollection or array.
    // For now, let's just trigger the toggle.

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

  const handleComment = (_postId: string) => {
    if (!user) {
      Alert.alert('Zaloguj się', 'Musisz być zalogowany, aby komentować.');
      return;
    }
    Alert.alert('Info', 'Funkcja komentowania wkrótce dostępna!');
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.postContainer}>
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder} />
        <View>
          <Text style={styles.username}>{item.authorName || 'Użytkownik'}</Text>
          <Text style={styles.time}>
            {item.createdAt?.seconds
              ? new Date(item.createdAt.seconds * 1000).toLocaleDateString()
              : 'Teraz'}
          </Text>
        </View>
      </View>

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

          <TouchableOpacity
            style={styles.interactionButton}
            onPress={() => handleComment(item.id)}
          >
            <Ionicons name="chatbubble-outline" size={22} color="#333" />
            <Text style={styles.interactionText}>{item.commentCount || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>Triply</Text>
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Brak postów. Bądź pierwszy!</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
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
});
