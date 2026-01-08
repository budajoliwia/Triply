import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useEffect, useState } from 'react';
import { getPosts, Post } from '../../src/services/posts';

export default function FeedScreen() {
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

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.postContainer}>
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder} />
        <View>
          {/* TODO: Fetch user profile to get username */}
          <Text style={styles.username}>Użytkownik</Text>
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
        <Text style={styles.likes}>❤️ {item.likeCount || 0} polubień</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>Triply</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
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
  likes: {
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
