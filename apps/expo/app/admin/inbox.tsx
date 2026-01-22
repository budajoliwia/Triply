import { useEffect, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/auth';
import {
  markAdminNotificationRead,
  subscribeAdminNotifications,
  type AdminNotification,
} from '../../src/services/adminNotifications';
import { formatTimestampDate } from '../../src/utils/time';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { Button } from '../../src/components/Button';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, space, typography } from '../../src/theme';

function formatMeta(n: AdminNotification): string {
  const score = typeof n.meta?.score === 'number' ? n.meta?.score : null;
  const cats = n.meta?.categories && typeof n.meta.categories === 'object' ? n.meta.categories : null;
  const top = cats
    ? Object.entries(cats)
        .filter(([, v]) => typeof v === 'number')
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${Number(v).toFixed(2)}`)
        .join(', ')
    : '';
  const scoreStr = score != null ? `score: ${score.toFixed(2)}` : '';
  if (scoreStr && top) return `${scoreStr} • ${top}`;
  return scoreStr || top || '';
}

export default function AdminInboxScreen() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    return subscribeAdminNotifications(
      { limit: 50, unreadOnly: true },
      (next) => {
        setItems(next);
        setLoading(false);
      },
      (e) => {
        console.warn('Admin inbox listener error:', e);
        setError(e);
        setLoading(false);
      },
    );
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Inbox Admina</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Brak dostępu.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox Admina</Text>
      </View>

      {loading ? (
        <View style={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SurfaceCard key={i} style={styles.card}>
              <SkeletonBlock height={16} width={220} radius={8} />
              <View style={{ height: 8 }} />
              <SkeletonBlock height={12} width={120} radius={6} />
              <View style={{ height: 10 }} />
              <SkeletonBlock height={12} width={'85%'} radius={6} />
              <View style={{ height: 12 }} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <SkeletonBlock height={36} width={120} radius={999} />
                <SkeletonBlock height={36} width={160} radius={999} />
              </View>
            </SurfaceCard>
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
          description={mapFirestoreErrorToMessage(error, 'Nie udało się załadować inboxa admina.')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="Brak powiadomień"
              description="Nie ma żadnych postów wymagających ręcznej moderacji."
              icon="checkmark-done-outline"
            />
          }
          renderItem={({ item }) => {
            const meta = formatMeta(item);
            const dateLabel = formatTimestampDate(item.createdAt, 'Teraz');
            return (
              <SurfaceCard style={styles.card}>
                <Text style={styles.cardTitle}>Wymaga ręcznej moderacji</Text>
                <Text style={styles.cardSub}>{dateLabel}</Text>
                {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}

                <View style={styles.actions}>
                  <Button label="Otwórz post" variant="primary" onPress={() => router.push(`/post/${item.postId}`)} />
                  <Button
                    label="Oznacz jako przeczytane"
                    variant="secondary"
                    onPress={() => markAdminNotificationRead(item.id).catch((e) => console.warn('markAdminNotificationRead failed', e))}
                  />
                </View>
              </SurfaceCard>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  title: { ...typography.titleXL },
  list: { padding: space.lg, paddingBottom: space['2xl'] },
  card: {
    padding: space.lg,
    marginBottom: space.lg,
  },
  cardTitle: { ...typography.titleMD },
  cardSub: { marginTop: 4, ...typography.meta, color: colors.textTertiary },
  cardMeta: { marginTop: 8, ...typography.meta, color: colors.textSecondary },
  actions: { marginTop: space.lg, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary },
});


