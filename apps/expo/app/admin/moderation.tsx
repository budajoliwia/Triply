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
import { getPosts, approvePost, rejectPost, Post } from '../../src/services/posts';
import { classifyFirestoreError, mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { subscribeAdminUnreadCount } from '../../src/services/adminNotifications';
import { useAuth } from '../../src/context/auth';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { PostStatusBadge } from '../../src/components/PostStatusBadge';

export default function ModerationScreen() {
  const { isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectingPostId, setRejectingPostId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      setError(null);
      const pendingPosts = await getPosts('pending');
      setPosts(pendingPosts);
    } catch (error) {
      console.error(error);
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeAdminUnreadCount(
      (count) => setInboxUnread(count),
      (e) => console.warn('Admin unread count listener error:', e),
    );
  }, [isAdmin]);

  const handleApprove = async (id: string) => {
    try {
      await approvePost(id);
      Alert.alert('Sukces', 'Post zatwierdzony.');
      fetchPosts(); // Refresh list
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się zatwierdzić posta.'));
    }
  };

  const openRejectModal = (id: string) => {
    setRejectingPostId(id);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const closeRejectModal = () => {
    if (rejectSubmitting) return;
    setRejectModalVisible(false);
    setRejectingPostId(null);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingPostId) return;
    if (rejectSubmitting) return;
    setRejectSubmitting(true);
    try {
      await rejectPost(rejectingPostId, rejectReason);
      Alert.alert('Sukces', 'Post odrzucony.');
      closeRejectModal();
      fetchPosts(); // Refresh list
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się odrzucić posta.'));
    } finally {
      setRejectSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.postContainer}>
      <View style={styles.rowTop}>
        <Text style={styles.authorId}>Autor ID: {item.authorId}</Text>
        <PostStatusBadge status={item.status} compact />
      </View>
      <Text style={styles.content}>{item.text}</Text>

      {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.postImage} />}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton]}
          onPress={() => openRejectModal(item.id)}
        >
          <Text style={styles.buttonText}>Odrzuć</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.approveButton]}
          onPress={() => handleApprove(item.id)}
        >
          <Text style={styles.buttonText}>Zatwierdź</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Moderacja ({posts.length})</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.inboxBtn} onPress={() => router.push('/admin/inbox')}>
            <Text style={styles.inboxText}>Inbox</Text>
            {inboxUnread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{inboxUnread >= 10 ? '9+' : String(inboxUnread)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={fetchPosts}>
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
          onRetry={fetchPosts}
        />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="Brak postów"
              description="Brak postów oczekujących na ręczną moderację."
              icon="checkmark-done-outline"
              actionLabel="Odśwież"
              onAction={fetchPosts}
            />
          }
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
