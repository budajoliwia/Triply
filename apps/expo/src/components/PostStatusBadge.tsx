import { View, Text, StyleSheet } from 'react-native';
import type { PostStatus } from '@triply/shared/src/models';

type AiDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';

function statusLabel(status: PostStatus): string {
  if (status === 'approved') return 'Zatwierdzone';
  if (status === 'pending') return 'Oczekujące';
  if (status === 'rejected') return 'Odrzucone';
  return 'Szkic';
}

function infoLabel(status: PostStatus, ai?: { textDecision?: AiDecision | null; imageDecision?: AiDecision | null } | null): string | null {
  if (status === 'pending') return 'Wymaga ręcznej moderacji';

  if (status === 'approved') {
    const autoApproved = ai?.textDecision === 'ALLOW' && (ai?.imageDecision == null || ai?.imageDecision === 'ALLOW');
    return autoApproved ? 'Zatwierdzone automatycznie 🤖' : null;
  }

  if (status === 'rejected') {
    const aiRejected = ai?.textDecision === 'BLOCK' || ai?.imageDecision === 'BLOCK';
    return aiRejected ? 'Odrzucone przez AI' : 'Odrzucone przez admina';
  }

  return null;
}

export function PostStatusBadge({
  status,
  ai,
  compact = false,
}: {
  status: PostStatus;
  ai?: { textDecision?: AiDecision | null; imageDecision?: AiDecision | null } | null;
  compact?: boolean;
}) {
  const info = infoLabel(status, ai);
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.pill,
          status === 'approved' && styles.approved,
          status === 'pending' && styles.pending,
          status === 'rejected' && styles.rejected,
          status === 'draft' && styles.draft,
        ]}
      >
        <Text style={styles.pillText}>{statusLabel(status)}</Text>
      </View>
      {!compact && info ? <Text style={styles.info}>{info}</Text> : null}
      {compact && info ? (
        <Text style={styles.infoCompact} numberOfLines={1}>
          {info}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eaeaea',
  },
  approved: { backgroundColor: 'rgba(52, 199, 89, 0.18)' },
  pending: { backgroundColor: 'rgba(255, 149, 0, 0.18)' },
  rejected: { backgroundColor: 'rgba(255, 59, 48, 0.18)' },
  draft: { backgroundColor: 'rgba(142, 142, 147, 0.18)' },
  pillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#222',
  },
  info: {
    marginTop: 6,
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  infoCompact: {
    marginTop: 5,
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    maxWidth: 180,
  },
});


