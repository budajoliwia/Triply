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
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { Button } from '../../src/components/Button';
import { colors, hairline, radius, space, typography } from '../../src/theme';

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
  const [error, setError] = useState<unknown | null>(null);
  const [retryKey, setRetryKey] = useState(0);
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
    setError(null);
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
        setError(error);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, retryKey]);

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
      setError(null);
      const userPosts = await getUserPosts(userId, 'approved');
      setPosts(userPosts);
    } catch (error) {
      console.error('Error fetching user posts:', error);
      setError(error);
    }
  }, [userId, retryKey]);

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
          <Ionicons name="image-outline" size={30} color={colors.textTertiary} />
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
          <Button
            label={following ? 'Obserwujesz' : 'Obserwuj'}
            onPress={handleToggleFollow}
            loading={actionLoading}
            disabled={actionLoading}
            variant={following ? 'secondary' : 'primary'}
            style={{ minWidth: 140 }}
          />
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { padding: 20, width: '100%' }]}>
        <SkeletonBlock height={100} width={100} radius={50} />
        <View style={{ height: 12 }} />
        <SkeletonBlock height={20} width={180} radius={10} />
        <View style={{ height: 10 }} />
        <SkeletonBlock height={14} width={'80%'} radius={7} />
        <View style={{ height: 8 }} />
        <SkeletonBlock height={14} width={'70%'} radius={7} />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          kind={
            classifyFirestoreError(error) === 'offline'
              ? 'offline'
              : classifyFirestoreError(error) === 'permission'
                ? 'permission'
                : classifyFirestoreError(error) === 'timeout'
                  ? 'timeout'
                  : 'unknown'
          }
          title={
            classifyFirestoreError(error) === 'offline'
              ? 'Brak internetu'
              : classifyFirestoreError(error) === 'permission'
                ? 'Brak uprawnień'
                : classifyFirestoreError(error) === 'timeout'
                  ? 'Przekroczono czas oczekiwania'
                  : 'Coś poszło nie tak'
          }
          description={mapFirestoreErrorToMessage(error, 'Nie udało się załadować profilu.')}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setRetryKey((x) => x + 1);
          }}
        />
      </SafeAreaView>
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
          <EmptyState title="Brak postów" description="Użytkownik nie dodał jeszcze postów." icon="images-outline" />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    padding: space['2xl'],
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  name: {
    ...typography.titleXL,
    marginBottom: space.xs,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: space.xl,
    textAlign: 'center',
  },
  bioPlaceholder: {
    color: colors.textTertiary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: space.xl,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.titleLG,
  },
  statLabel: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: space['2xl'],
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 2,
  },
  gridImage: {
    flex: 1,
    backgroundColor: colors.skeleton,
    borderRadius: radius.md,
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});

