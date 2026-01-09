import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../src/context/auth';
import { auth, db } from '../../src/firebase/client';
import { getUserPosts, Post } from '../../src/services/posts';
import { useEffect, useState, useCallback } from 'react';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;

export default function MyProfileScreen() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUserPosts = useCallback(async () => {
    if (!user) return;
    try {
      const userPosts = await getUserPosts(user.uid);
      setPosts(userPosts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserPosts();
  }, [fetchUserPosts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUserPosts();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const promoteToAdmin = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { role: 'admin' });
      Alert.alert('Sukces', 'Twoje konto ma teraz uprawnienia administratora. Odśwież aplikację.');
    } catch (error) {
      console.error('Error promoting to admin:', error);
      Alert.alert('Błąd', 'Nie udało się nadać uprawnień admina.');
    }
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.gridItem}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.gridImage} />
      ) : (
        <View style={[styles.gridImage, styles.placeholderContainer]}>
          <Text style={styles.postTextContent} numberOfLines={4}>
            {item.text}
          </Text>
        </View>
      )}
      {item.status === 'pending' && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>Oczekuje</Text>
        </View>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.profileHeader}>
      <View style={styles.avatarLarge} />
      <Text style={styles.name}>Mój Profil</Text>
      <Text style={styles.bio}>Podróżnik | Fotografia | Kawa</Text>

      {isAdmin && (
        <TouchableOpacity
          style={styles.adminButton}
          onPress={() => router.push('/admin/moderation')}
        >
          <Text style={styles.adminButtonText}>Panel Admina (Moderacja)</Text>
        </TouchableOpacity>
      )}

      {/* Temporary Dev Button */}
      {!isAdmin && (
        <TouchableOpacity
          style={[styles.adminButton, styles.devButton]}
          onPress={promoteToAdmin}
        >
          <Text style={styles.adminButtonText}>DEV: Make Me Admin</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Wyloguj</Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{posts.length}</Text>
          <Text style={styles.statLabel}>Posty</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>240</Text>
          <Text style={styles.statLabel}>Obserwujący</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>180</Text>
          <Text style={styles.statLabel}>Obserwowani</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={COLUMN_COUNT}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Nie masz jeszcze żadnych postów.</Text>
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
    backgroundColor: '#fff',
  },
  loader: {
    marginTop: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
  profileHeader: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 5,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ddd',
    marginBottom: 15,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bio: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  adminButton: {
    backgroundColor: '#333',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  devButton: {
    backgroundColor: 'orange',
  },
  adminButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutButton: {
    marginBottom: 20,
    padding: 10,
  },
  logoutButtonText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
    position: 'relative',
  },
  gridImage: {
    flex: 1,
    backgroundColor: '#eee',
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 5,
  },
  postTextContent: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
});
