import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { approvePost, getPostById, rejectPost, type Post } from '../../src/services/posts';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import {
  markAdminNotificationRead,
  subscribeAdminNotifications,
  subscribeAdminUnreadCount,
  type AdminNotification,
} from '../../src/services/adminNotifications';
import { useAuth } from '../../src/context/auth';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { formatTimestampDate } from '../../src/utils/time';

export default function ModerationScreen() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [postById, setPostById] = useState<Record<string, Post | null>>({});
  const [actionPostId, setActionPostId] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<AdminNotification | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);

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
        console.warn('Admin moderation listener error:', e);
        setError(e);
        setLoading(false);
      },
    );
  }, [isAdmin, reloadKey]);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeAdminUnreadCount(
      (count) => setInboxUnread(count),
      (e) => console.warn('Admin unread count listener error:', e),
    );
  }, [isAdmin]);

  useEffect(() => {
    // Fetch post previews for unseen inbox items.
    const missing = items.map((i) => i.postId).filter((postId) => postId && !(postId in postById));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (postId) => {
          try {
            const p = await getPostById(postId);
            return { postId, post: p };
          } catch (e) {
            console.warn('Failed to load post preview:', postId, e);
            return { postId, post: null };
          }
        }),
      );
      if (cancelled) return;
      setPostById((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.postId] = r.post;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [items, postById]);

  function formatAiReason(n: AdminNotification): { score?: string; categories?: string } {
    const score = typeof n.meta?.score === 'number' ? n.meta.score : null;
    const cats = n.meta?.categories && typeof n.meta.categories === 'object' ? n.meta.categories : null;
    const top = cats
      ? Object.entries(cats)
          .filter(([, v]) => typeof v === 'number')
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${Number(v).toFixed(2)}`)
          .join(', ')
      : '';
    return {
      ...(score != null ? { score: `score: ${score.toFixed(2)}` } : {}),
      ...(top ? { categories: top } : {}),
    };
  }

  const handleApprove = async (item: AdminNotification) => {
    if (actionPostId) return;
    setActionPostId(item.postId);
    // optimistic remove
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await approvePost(item.postId);
      await markAdminNotificationRead(item.id);
      Alert.alert('Sukces', 'Post zatwierdzony.');
    } catch (error) {
      console.error(error);
      setItems((prev) => [item, ...prev]);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się zatwierdzić posta.'));
    } finally {
      setActionPostId(null);
    }
  };

  const openRejectModal = (item: AdminNotification) => {
    setRejectingItem(item);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const closeRejectModal = () => {
    if (rejectSubmitting) return;
    setRejectModalVisible(false);
    setRejectingItem(null);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingItem) return;
    if (rejectSubmitting) return;
    setRejectSubmitting(true);
    try {
      setItems((prev) => prev.filter((x) => x.id !== rejectingItem.id));
      await rejectPost(rejectingItem.postId, rejectReason);
      await markAdminNotificationRead(rejectingItem.id);
      Alert.alert('Sukces', 'Post odrzucony.');
      closeRejectModal();
    } catch (error) {
      console.error(error);
      setItems((prev) => (rejectingItem ? [rejectingItem, ...prev] : prev));
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się odrzucić posta.'));
    } finally {
      setRejectSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Moderacja ({items.length})</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.inboxBtn} onPress={() => router.push('/admin/inbox')}>
            <Text style={styles.inboxText}>Inbox</Text>
            {inboxUnread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{inboxUnread >= 10 ? '9+' : String(inboxUnread)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPostById({});
              setReloadKey((x) => x + 1);
            }}
          >
            <Text style={styles.refreshText}>Odśwież</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.postContainer}>
              <SkeletonBlock height={14} width={180} radius={7} />
              <View style={{ height: 10 }} />
              <SkeletonBlock height={16} width={'92%'} radius={8} />
              <View style={{ height: 8 }} />
              <SkeletonBlock height={16} width={'86%'} radius={8} />
              <View style={{ height: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <SkeletonBlock height={36} width={120} radius={8} />
                <SkeletonBlock height={36} width={120} radius={8} />
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
          description={mapFirestoreErrorToMessage(error, 'Nie udało się pobrać postów do moderacji.')}
          onRetry={() => {
            setPostById({});
            setReloadKey((x) => x + 1);
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="Brak postów"
              description="Brak postów oczekujących na ręczną moderację."
              icon="checkmark-done-outline"
            />
          }
          renderItem={({ item }) => {
            const p = postById[item.postId];
            const ai = formatAiReason(item);
            const busy = actionPostId === item.postId || rejectSubmitting;
            const dateLabel = formatTimestampDate(item.createdAt, 'Teraz');
            return (
              <View style={styles.postContainer}>
                <View style={styles.rowTop}>
                  <Text style={styles.cardTitle}>Do ręcznej moderacji</Text>
                  <Text style={styles.cardSub}>{dateLabel}</Text>
                </View>

                {ai.score || ai.categories ? (
                  <View style={styles.aiBox}>
                    <Text style={styles.aiTitle}>Dlaczego AI zostawiło do review</Text>
                    {ai.score ? <Text style={styles.aiText}>{ai.score}</Text> : null}
                    {ai.categories ? <Text style={styles.aiText}>{ai.categories}</Text> : null}
                  </View>
                ) : null}

                {!p ? (
                  <View>
                    <SkeletonBlock height={14} width={'92%'} radius={7} />
                    <View style={{ height: 8 }} />
                    <SkeletonBlock height={14} width={'84%'} radius={7} />
                    <View style={{ height: 10 }} />
                    <SkeletonBlock height={180} width={'100%'} radius={10} />
                  </View>
                ) : (
                  <View>
                    <Text style={styles.previewText} numberOfLines={5}>
                      {p.text}
                    </Text>
                    {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={styles.postImage} resizeMode="cover" /> : null}
                  </View>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.button, styles.rejectButton, busy && styles.disabledButton]}
                    onPress={() => openRejectModal(item)}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.approveButton, busy && styles.disabledButton]}
                    onPress={() => handleApprove(item)}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Approve</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.bottomRow}>
                  <TouchableOpacity onPress={() => router.push(`/post/${item.postId}`)}>
                    <Text style={styles.link}>Otwórz szczegóły posta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      // optimistic remove + mark read
                      setItems((prev) => prev.filter((x) => x.id !== item.id));
                      markAdminNotificationRead(item.id).catch((e) => console.warn('markAdminNotificationRead failed', e));
                    }}
                  >
                    <Text style={styles.linkMuted}>Oznacz jako przeczytane</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={rejectModalVisible} transparent animationType="fade" onRequestClose={closeRejectModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Odrzuć post</Text>
            <Text style={styles.modalSubtitle}>Opcjonalnie podaj powód (autor go zobaczy).</Text>
            <TextInput
              style={styles.reasonInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Np. naruszenie zasad, spam, treść nie na temat…"
              multiline
              maxLength={240}
              editable={!rejectSubmitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancel]} onPress={closeRejectModal} disabled={rejectSubmitting}>
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalReject]} onPress={confirmReject} disabled={rejectSubmitting}>
                {rejectSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalRejectText}>Odrzuć</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshText: {
    color: '#007AFF',
  },
  inboxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0f0f0',
  },
  inboxText: {
    color: '#333',
    fontWeight: '700',
  },
  badge: {
    marginLeft: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  list: {
    padding: 10,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111',
  },
  cardSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  aiBox: {
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 149, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.25)',
    borderRadius: 12,
    padding: 10,
  },
  aiTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6b3f00',
    marginBottom: 6,
  },
  aiText: {
    fontSize: 12,
    color: '#333',
    lineHeight: 17,
    marginBottom: 3,
  },
  previewText: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 12,
  },
  linkMuted: {
    color: '#666',
    fontWeight: '700',
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  postContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  authorId: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  content: {
    fontSize: 16,
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eee',
    resizeMode: 'cover',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#ff4444',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
  },
  modalSubtitle: {
    marginTop: 6,
    color: '#666',
    fontSize: 13,
  },
  reasonInput: {
    marginTop: 12,
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
    gap: 10,
  },
  modalButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalCancelText: {
    color: '#333',
    fontWeight: '700',
  },
  modalReject: {
    backgroundColor: '#ff4444',
  },
  modalRejectText: {
    color: '#fff',
    fontWeight: '800',
  },
});
