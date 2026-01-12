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
import { router, useFocusEffect } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../src/context/auth';
import { auth, db } from '../../src/firebase/client';
import { getUserPosts, Post } from '../../src/services/posts';
import { useEffect, useState, useCallback } from 'react';
import type { UserDoc } from '@triply/shared/src/models';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;

type ProfilePostFilter = 'approved' | 'pending';

export default function MyProfileScreen() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [postFilter, setPostFilter] = useState<ProfilePostFilter>('approved');

  const fetchUserPosts = useCallback(async () => {
    if (!user) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
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

  // Refresh posts when user returns to this tab (Expo Router tabs keep screens mounted).
  useFocusEffect(
    useCallback(() => {
      fetchUserPosts();
    }, [fetchUserPosts]),
  );

  useEffect(() => {
    const fetchUsername = async () => {
      if (!user) {
        setUsername(null);
        return;
      }
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const data = snap.data() as UserDoc;
          setUsername(typeof data.username === 'string' ? data.username : null);
        } else {
          setUsername(null);
        }
      } catch (error) {
        console.error('Error fetching username:', error);
        setUsername(null);
      }
    };

    fetchUsername();
  }, [user]);

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
      <Text style={styles.name}>{username ? `@${username}` : 'Mój Profil'}</Text>
      <Text style={styles.bio}>Podróżnik | Fotografia | Kawa</Text>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, postFilter === 'approved' && styles.filterPillActive]}
          onPress={() => setPostFilter('approved')}
        >
          <Text style={[styles.filterText, postFilter === 'approved' && styles.filterTextActive]}>
            Zatwierdzone
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterPill, postFilter === 'pending' && styles.filterPillActive]}
          onPress={() => setPostFilter('pending')}
        >
          <Text style={[styles.filterText, postFilter === 'pending' && styles.filterTextActive]}>
            Oczekujące
          </Text>
        </TouchableOpacity>
      </View>

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

  const filteredPosts = posts.filter((p) => p.status === postFilter);

  const emptyText =
    postFilter === 'approved'
      ? 'Nie masz jeszcze żadnych zatwierdzonych postów.'
      : 'Brak postów oczekujących na zatwierdzenie.';

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <FlatList
          data={filteredPosts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={COLUMN_COUNT}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{emptyText}</Text>
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
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#f2f2f2',
    borderRadius: 999,
    padding: 4,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterPillActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  filterTextActive: {
    color: '#fff',
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
