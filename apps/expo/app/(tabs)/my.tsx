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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../src/context/auth';
import { auth, db } from '../../src/firebase/client';
import { getUserPosts, Post } from '../../src/services/posts';
import { useEffect, useState, useCallback } from 'react';
import type { PostStatus, UserDoc } from '@triply/shared/src/models';
import { Avatar } from '../../src/components/Avatar';
import { getDownloadUrlCached, invalidateDownloadUrl } from '../../src/firebase/storage';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;

type ProfilePostFilter = Exclude<PostStatus, 'draft'>;

export default function MyProfileScreen() {
  const { user, isAdmin } = useAuth();
  const { refreshAvatar } = useLocalSearchParams<{ refreshAvatar?: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
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

  // Firestore is the source of truth for profile + counters (survives refresh/navigation)
  useEffect(() => {
    if (!user) {
      setUsername(null);
      setBio(null);
      setAvatarPath(null);
      setAvatarUrl(null);
      setStats({ followers: 0, following: 0 });
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    let active = true;
    const unsubscribe = onSnapshot(
      userDocRef,
      async (snap) => {
        if (!snap.exists()) {
          setUsername(null);
          setBio(null);
          setAvatarPath(null);
          setAvatarUrl(null);
          setStats({ followers: 0, following: 0 });
          return;
        }
        const data = snap.data() as UserDoc;
        setUsername(typeof data.username === 'string' ? data.username : null);
        setBio(typeof data.bio === 'string' ? data.bio : null);
        const nextAvatarPath = typeof data.avatarPath === 'string' ? data.avatarPath : null;
        setAvatarPath(nextAvatarPath);
        setStats({
          followers: typeof data.followersCount === 'number' ? data.followersCount : 0,
          following: typeof data.followingCount === 'number' ? data.followingCount : 0,
        });

        // Resolve avatar URL only when path exists.
        if (!nextAvatarPath) {
          setAvatarUrl(null);
          return;
        }
        try {
          const url = await getDownloadUrlCached(nextAvatarPath);
          if (!active) return;
          setAvatarUrl(url);
        } catch (e) {
          console.warn('Failed to load avatar URL:', e);
          if (!active) return;
          setAvatarUrl(null);
        }
      },
      (error) => {
        console.error('Error subscribing to user doc:', error);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  // When coming back from edit, force avatar URL refresh (same path overwrite).
  useEffect(() => {
    if (!avatarPath) return;
    if (!refreshAvatar) return;

    let cancelled = false;
    (async () => {
      try {
        invalidateDownloadUrl(avatarPath);
        const url = await getDownloadUrlCached(avatarPath);
        if (!cancelled) setAvatarUrl(url);
      } catch (e) {
        console.warn('Failed to refresh avatar URL:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshAvatar, avatarPath]);

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

  const renderItem = ({ item }: { item: Post }) => {
    const showRejectedReason = item.status === 'rejected' && typeof item.rejectionReason === 'string' && !!item.rejectionReason.trim();

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => router.push(`/post/${item.id}`)}
        onLongPress={() => {
          if (!showRejectedReason) return;
          Alert.alert('Powód odrzucenia', item.rejectionReason!.trim());
        }}
        delayLongPress={350}
      >
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

        {item.status === 'rejected' && (
          <View style={styles.rejectedBadge}>
            <Text style={styles.rejectedText}>Odrzucone</Text>
          </View>
        )}

        {showRejectedReason && (
          <View style={styles.reasonOverlay}>
            <Text style={styles.reasonText} numberOfLines={2}>
              Powód: {item.rejectionReason!.trim()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.profileHeader}>
      <Avatar size={100} uri={avatarUrl} cacheBuster={refreshAvatar} />
      <Text style={styles.name}>{username ? `@${username}` : 'Mój Profil'}</Text>
      <Text style={[styles.bio, !bio && styles.bioPlaceholder]} numberOfLines={3}>
        {bio ? bio : 'Dodaj krótki opis o sobie'}
      </Text>

      <TouchableOpacity style={styles.editProfileButton} onPress={() => router.push('/edit-profile')}>
        <Text style={styles.editProfileButtonText}>Edytuj profil</Text>
      </TouchableOpacity>

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
        <TouchableOpacity
          style={[styles.filterPill, postFilter === 'rejected' && styles.filterPillActive]}
          onPress={() => setPostFilter('rejected')}
        >
          <Text style={[styles.filterText, postFilter === 'rejected' && styles.filterTextActive]}>
            Odrzucone
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

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Wyloguj</Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.followers}</Text>
          <Text style={styles.statLabel}>Obserwujący</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.following}</Text>
          <Text style={styles.statLabel}>Obserwuje</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{posts.filter((p) => p.status === 'approved').length}</Text>
          <Text style={styles.statLabel}>Posty</Text>
        </View>
      </View>
    </View>
  );

  const filteredPosts = posts.filter((p) => p.status === postFilter);

  const emptyText =
    postFilter === 'approved'
      ? 'Nie masz jeszcze żadnych zatwierdzonych postów.'
      : postFilter === 'pending'
        ? 'Brak postów oczekujących na zatwierdzenie.'
        : 'Brak odrzuconych postów.';

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
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bio: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  bioPlaceholder: {
    color: '#999',
  },
  editProfileButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 12,
  },
  editProfileButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
  rejectedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(255, 59, 48, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rejectedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  reasonOverlay: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  reasonText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
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
