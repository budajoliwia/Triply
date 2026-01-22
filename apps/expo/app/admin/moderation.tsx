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
import { Button } from '../../src/components/Button';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, shadow, space, typography } from '../../src/theme';

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
            <SurfaceCard key={i} style={styles.postContainer}>
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
              <SurfaceCard style={styles.postContainer}>
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
                  <Button
                    label="Reject"
                    variant="destructive"
                    onPress={() => openRejectModal(item)}
                    disabled={busy}
                    style={{ flex: 1 }}
                  />
                  <Button label="Approve" variant="primary" onPress={() => handleApprove(item)} disabled={busy} style={{ flex: 1 }} />
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
              </SurfaceCard>
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
              <Button label="Anuluj" variant="secondary" onPress={closeRejectModal} disabled={rejectSubmitting} />
              <Button label="Odrzuć" variant="destructive" onPress={confirmReject} loading={rejectSubmitting} disabled={rejectSubmitting} />
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
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
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
    ...typography.titleXL,
  },
  refreshText: {
    ...typography.meta,
    color: colors.primary,
  },
  inboxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  inboxText: {
    ...typography.meta,
    color: colors.text,
  },
  badge: {
    marginLeft: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
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
    padding: space.lg,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    ...typography.titleMD,
  },
  cardSub: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: 2,
  },
  aiBox: {
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: colors.warningSoft,
    borderWidth: hairline,
    borderColor: 'rgba(154, 106, 31, 0.22)',
    borderRadius: radius.md,
    padding: space.md,
  },
  aiTitle: {
    ...typography.meta,
    color: colors.warning,
    marginBottom: 6,
  },
  aiText: {
    ...typography.meta,
    color: colors.text,
    lineHeight: 17,
    marginBottom: 3,
  },
  previewText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 20,
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    ...typography.meta,
    color: colors.primary,
  },
  linkMuted: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  disabledButton: {
    opacity: 0.6,
  },
  postContainer: {
    padding: space.lg,
    marginBottom: space.lg,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: 10,
    backgroundColor: colors.skeleton,
    resizeMode: 'cover',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    ...shadow.floating,
  },
  modalTitle: {
    ...typography.titleLG,
  },
  modalSubtitle: {
    marginTop: 6,
    ...typography.body,
    color: colors.textSecondary,
  },
  reasonInput: {
    marginTop: 12,
    minHeight: 90,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
});
