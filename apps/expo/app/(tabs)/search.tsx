import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resolveAvatarUrl, searchUsers, UserProfile } from '../../src/services/users';
import { Avatar } from '../../src/components/Avatar';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, space, typography } from '../../src/theme';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [error, setError] = useState<unknown | null>(null);

  // Debounce effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  // Search effect
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        setError(null);
        return;
      }

      setLoading(true);
      try {
        setError(null);
        const users = await searchUsers(debouncedQuery);
        const withAvatars = await Promise.all(
          users.map(async (u) => {
            const avatarUrl = await resolveAvatarUrl(u.avatarPath);
            return { ...u, avatarUrl: avatarUrl || undefined };
          }),
        );
        setResults(withAvatars);
      } catch (error) {
        console.error(error);
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  const renderItem = ({ item }: { item: UserProfile }) => (
    <TouchableOpacity
      onPress={() => router.push(`/profile/${item.id}`)}
    >
      <SurfaceCard style={styles.userItem}>
        <Avatar size={40} uri={item.avatarUrl} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.email}>{item.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </SurfaceCard>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wyszukaj</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj użytkowników..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textTertiary}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.listContent}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.userItem}>
              <SkeletonBlock height={40} width={40} radius={20} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <SkeletonBlock height={14} width={160} radius={7} />
                <View style={{ height: 6 }} />
                <SkeletonBlock height={12} width={220} radius={6} />
              </View>
              <SkeletonBlock height={16} width={16} radius={8} />
            </View>
          ))}
        </View>
      ) : error ? (
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
          description={mapFirestoreErrorToMessage(error, 'Nie udało się wyszukać użytkowników.')}
        />
      ) : (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            debouncedQuery.trim().length > 0 ? (
              <EmptyState title="Brak wyników" description="Spróbuj innego zapytania." icon="search-outline" />
            ) : (
              <EmptyState title="Wyszukaj" description="Wpisz nazwę użytkownika, aby zacząć." icon="search-outline" />
            )
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
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.titleXL,
    marginBottom: space.lg,
    color: colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    height: 40,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    ...typography.body,
    fontSize: 15,
    color: colors.text,
  },
  listContent: {
    padding: space.lg,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radius.lg,
  },
  userInfo: {
    flex: 1,
    marginLeft: space.md,
  },
  username: {
    ...typography.bodyEmph,
    fontSize: 15,
    marginBottom: 2,
    color: colors.text,
  },
  email: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});

