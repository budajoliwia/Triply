import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { getPosts, approvePost, rejectPost, Post } from '../../src/services/posts';

export default function ModerationScreen() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const pendingPosts = await getPosts('pending');
      setPosts(pendingPosts);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', 'Nie udało się pobrać postów do moderacji.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await approvePost(id);
      Alert.alert('Sukces', 'Post zatwierdzony.');
      fetchPosts(); // Refresh list
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się zatwierdzić posta.');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectPost(id);
      Alert.alert('Sukces', 'Post odrzucony.');
      fetchPosts(); // Refresh list
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się odrzucić posta.');
    }
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.postContainer}>
      <Text style={styles.authorId}>Autor ID: {item.authorId}</Text>
      <Text style={styles.content}>{item.text}</Text>

      {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.postImage} />}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton]}
          onPress={() => handleReject(item.id)}
        >
          <Text style={styles.buttonText}>Odrzuć</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.approveButton]}
          onPress={() => handleApprove(item.id)}
        >
          <Text style={styles.buttonText}>Zatwierdź</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Moderacja ({posts.length})</Text>
        <TouchableOpacity onPress={fetchPosts}>
          <Text style={styles.refreshText}>Odśwież</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Brak postów oczekujących na zatwierdzenie.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshText: {
    color: '#007AFF',
  },
  list: {
    padding: 10,
  },
  postContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  authorId: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  content: {
    fontSize: 16,
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eee',
    resizeMode: 'cover',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#ff4444',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: '#888',
  },
});
