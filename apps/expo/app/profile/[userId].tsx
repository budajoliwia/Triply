import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../src/context/auth';
import { getUserPosts, Post } from '../../src/services/posts';
import {
  UserProfile,
  followUser,
  unfollowUser,
} from '../../src/services/users';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase/client';
import { Avatar } from '../../src/components/Avatar';
import { getDownloadUrlCached } from '../../src/firebase/storage';
import { mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // If viewing own profile, redirect to "My Profile" tab
  useEffect(() => {
    if (user && userId === user.uid) {
      router.replace('/(tabs)/my');
    }
  }, [user, userId]);

  // Firestore is the source of truth (profile + counters)
  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    const userRef = doc(db, 'users', userId);
    let active = true;
    const unsubscribe = onSnapshot(
      userRef,
      async (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setAvatarUrl(null);
        } else {
          const next = { id: snap.id, ...(snap.data() as Omit<UserProfile, 'id'>) };
          setProfile(next);
          const avatarPath = typeof next.avatarPath === 'string' ? next.avatarPath : null;
          if (!avatarPath) {
            setAvatarUrl(null);
          } else {
            try {
              const url = await getDownloadUrlCached(avatarPath);
              if (active) setAvatarUrl(url);
            } catch (e) {
              console.warn('Failed to load avatar URL:', e);
              if (active) setAvatarUrl(null);
            }
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error subscribing to profile:', error);
        Alert.alert('Błąd', 'Nie udało się załadować profilu.');
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  // Firestore is the source of truth (following state = existence of doc)
  useEffect(() => {
    if (!user || !userId) {
      setFollowing(false);
      return;
    }

    const followingRef = doc(db, 'users', user.uid, 'following', userId);
    const unsubscribe = onSnapshot(
      followingRef,
      (snap) => {
        setFollowing(snap.exists());
      },
      (error) => {
        console.error('Error subscribing to following:', error);
      },
    );

    return unsubscribe;
  }, [user, userId]);

  // Posts list (approved only)
  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    try {
      const userPosts = await getUserPosts(userId, 'approved');
      setPosts(userPosts);
    } catch (error) {
      console.error('Error fetching user posts:', error);
    }
  }, [userId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleToggleFollow = async () => {
    if (!user || !userId) return;
    setActionLoading(true);
    try {
      if (following) {
        await unfollowUser(user.uid, userId);
      } else {
        await followUser(user.uid, userId);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się zmienić statusu obserwowania.'));
    } finally {
      setActionLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.gridItem}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.gridImage} resizeMode="cover" />
      ) : (
        <View style={[styles.gridImage, styles.placeholderImage]}>
          <Ionicons name="image-outline" size={32} color="#ccc" />
        </View>
      )}
    </View>
  );

  const renderHeader = () => {
    if (!profile) return null;

    return (
      <View style={styles.header}>
        <Avatar size={100} uri={avatarUrl} />
        <Text style={styles.name}>{profile.username ? `@${profile.username}` : 'Użytkownik'}</Text>
        <Text style={[styles.bio, !profile.bio && styles.bioPlaceholder]} numberOfLines={3}>
          {profile.bio ? profile.bio : 'Brak opisu'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile.followersCount || 0}</Text>
            <Text style={styles.statLabel}>Obserwujący</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile.followingCount || 0}</Text>
            <Text style={styles.statLabel}>Obserwuje</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{posts.filter((p) => p.status === 'approved').length}</Text>
            <Text style={styles.statLabel}>Posty</Text>
          </View>
        </View>

        {user && user.uid !== userId && (
          <TouchableOpacity
            style={[
              styles.followButton,
              following && styles.followingButton,
              actionLoading && styles.disabledButton,
            ]}
            onPress={handleToggleFollow}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.followButtonText, following && styles.followingButtonText]}>
                {following ? 'Obserwujesz' : 'Obserwuj'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Nie znaleziono użytkownika.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: profile.username || 'Profil',
          headerShown: true,
          headerBackTitle: 'Wróć',
        }}
      />
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={COLUMN_COUNT}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Użytkownik nie dodał jeszcze postów.</Text>
          </View>
        }
      />
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
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bio: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  bioPlaceholder: {
    color: '#999',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
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
    color: '#666',
  },
  followButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  followButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  followingButtonText: {
    color: '#007AFF',
  },
  disabledButton: {
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 20,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
  },
  gridImage: {
    flex: 1,
    backgroundColor: '#eee',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
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

