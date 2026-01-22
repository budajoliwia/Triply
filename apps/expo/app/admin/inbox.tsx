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
            <View key={i} style={styles.card}>
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
              icon="inbox-outline"
            />
          }
          renderItem={({ item }) => {
            const meta = formatMeta(item);
            const dateLabel = formatTimestampDate(item.createdAt, 'Teraz');
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Wymaga ręcznej moderacji</Text>
                <Text style={styles.cardSub}>{dateLabel}</Text>
                {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => router.push(`/post/${item.postId}`)}>
                    <Text style={styles.btnPrimaryText}>Otwórz post</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    onPress={() => markAdminNotificationRead(item.id).catch((e) => console.warn('markAdminNotificationRead failed', e))}
                  >
                    <Text style={styles.btnGhostText}>Oznacz jako przeczytane</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  list: { padding: 10, paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  cardSub: { marginTop: 4, fontSize: 12, color: '#888' },
  cardMeta: { marginTop: 8, fontSize: 12, color: '#444' },
  actions: { marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  btn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  btnPrimary: { backgroundColor: '#007AFF' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#f0f0f0' },
  btnGhostText: { color: '#333', fontWeight: '700' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#666' },
});


