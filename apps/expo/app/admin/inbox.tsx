import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/auth';
import {
  markAdminNotificationRead,
  subscribeAdminNotifications,
  type AdminNotification,
} from '../../src/services/adminNotifications';
import { formatTimestampDate } from '../../src/utils/time';

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

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    return subscribeAdminNotifications(
      { limit: 50, unreadOnly: true },
      (next) => {
        setItems(next);
        setLoading(false);
      },
      (e) => {
        console.warn('Admin inbox listener error:', e);
        setLoading(false);
      },
    );
  }, [isAdmin]);

  const emptyText = useMemo(() => {
    if (!isAdmin) return 'Brak dostępu.';
    if (loading) return 'Ładowanie…';
    return 'Brak powiadomień do przejrzenia.';
  }, [isAdmin, loading]);

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
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = formatMeta(item);
            const dateLabel = formatTimestampDate(item.createdAt, 'Teraz');
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Post wymaga przeglądu</Text>
                <Text style={styles.cardSub}>{dateLabel}</Text>
                {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => router.push(`/post/${item.postId}`)}
                  >
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


