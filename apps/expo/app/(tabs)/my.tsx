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
import { PostStatusBadge } from '../../src/components/PostStatusBadge';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { Button } from '../../src/components/Button';
import { colors, hairline, radius, space, typography } from '../../src/theme';

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
  const [error, setError] = useState<unknown | null>(null);
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
      setError(null);
      return;
    }
    try {
      setError(null);
      const userPosts = await getUserPosts(user.uid);
      setPosts(userPosts);
    } catch (error) {
      console.error(error);
      setError(error);
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
    const ai = {
      textDecision: ((item as any)?.moderation?.decision ?? null) as any,
      imageDecision: ((item as any)?.moderation?.image?.decision ?? null) as any,
    };

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

        <View style={styles.statusOverlay}>
          <PostStatusBadge status={item.status} ai={ai} compact />
        </View>

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

      <Button label="Edytuj profil" variant="primary" size="sm" onPress={() => router.push('/edit-profile')} style={{ marginBottom: space.md }} />

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
        <Button
          label="Panel Admina (Moderacja)"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/admin/moderation')}
          style={{ marginBottom: space.md }}
        />
      )}

      <Button label="Wyloguj" variant="destructive" size="sm" onPress={handleLogout} style={{ marginBottom: space.xl }} />

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

  const emptyTitle =
    postFilter === 'approved'
      ? 'Brak postów'
      : postFilter === 'pending'
        ? 'Brak postów'
        : 'Brak postów';
  const emptyDesc =
    postFilter === 'approved'
      ? 'Nie masz jeszcze żadnych zatwierdzonych postów.'
      : postFilter === 'pending'
        ? 'Nie masz postów oczekujących na moderację.'
        : 'Nie masz odrzuconych postów.';

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={{ padding: 20 }}>
          <View style={{ alignItems: 'center' }}>
            <SkeletonBlock height={100} width={100} radius={50} />
            <View style={{ marginTop: 12, width: 160 }}>
              <SkeletonBlock height={18} radius={9} />
            </View>
            <View style={{ marginTop: 10, width: '85%' }}>
              <SkeletonBlock height={14} radius={7} />
              <View style={{ height: 8 }} />
              <SkeletonBlock height={14} radius={7} />
            </View>
          </View>
          <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <SkeletonBlock height={34} width={110} radius={999} />
            <SkeletonBlock height={34} width={110} radius={999} />
            <SkeletonBlock height={34} width={110} radius={999} />
          </View>
          <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={{ width: ITEM_SIZE, height: ITEM_SIZE, padding: 1 }}>
                <SkeletonBlock height={ITEM_SIZE - 2} radius={0} />
              </View>
            ))}
          </View>
        </View>
      ) : error ? (
        <ErrorState
          kind={classifyFirestoreError(error) === 'permission' ? 'permission' : classifyFirestoreError(error) === 'offline' ? 'offline' : classifyFirestoreError(error) === 'timeout' ? 'timeout' : 'unknown'}
          title={
            classifyFirestoreError(error) === 'offline'
              ? 'Brak internetu'
              : classifyFirestoreError(error) === 'permission'
                ? 'Brak uprawnień'
                : classifyFirestoreError(error) === 'timeout'
                  ? 'Przekroczono czas oczekiwania'
                  : 'Coś poszło nie tak'
          }
          description={mapFirestoreErrorToMessage(error, 'Nie udało się załadować postów.')}
          onRetry={() => {
            setLoading(true);
            fetchUserPosts();
          }}
        />
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
            <EmptyState title={emptyTitle} description={emptyDesc} icon="images-outline" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingBottom: space['2xl'],
  },
  profileHeader: {
    padding: space['2xl'],
    alignItems: 'center',
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    marginBottom: 5,
  },
  name: {
    ...typography.titleXL,
    marginBottom: space.xs,
  },
  bio: {
    ...typography.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: space.lg,
    textAlign: 'center',
  },
  bioPlaceholder: {
    color: colors.textTertiary,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: space.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  filterPill: {
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  filterPillActive: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: space['2xl'],
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
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 2,
    position: 'relative',
  },
  gridImage: {
    flex: 1,
    backgroundColor: colors.skeleton,
    borderRadius: radius.md,
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 5,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  postTextContent: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statusOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(252, 251, 248, 0.92)',
    padding: 6,
    borderRadius: 12,
    maxWidth: ITEM_SIZE - 12,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  reasonOverlay: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    borderRadius: radius.md,
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
    ...typography.body,
    color: colors.textTertiary,
  },
});
