import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PostStatus } from '@triply/shared/src/models';
import { colors, radius, space, typography } from '../theme';

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
    return autoApproved ? 'Zatwierdzone automatycznie' : null;
  }

  if (status === 'rejected') {
    const aiRejected = ai?.textDecision === 'BLOCK' || ai?.imageDecision === 'BLOCK';
    return aiRejected ? 'Odrzucone automatycznie' : 'Odrzucone przez admina';
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
  const icon: keyof typeof Ionicons.glyphMap =
    status === 'approved'
      ? 'checkmark-circle'
      : status === 'pending'
        ? 'time'
        : status === 'rejected'
          ? 'close-circle'
          : 'create';
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
        <Ionicons
          name={icon}
          size={14}
          color={
            status === 'approved'
              ? colors.success
              : status === 'pending'
                ? colors.warning
                : status === 'rejected'
                  ? colors.danger
                  : colors.textSecondary
          }
          style={{ marginRight: 6 }}
        />
        <Text style={styles.pillText}>{statusLabel(status)}</Text>
        {info && (status === 'approved' || status === 'rejected') ? (
          <Ionicons name="sparkles" size={13} color={colors.textTertiary} style={{ marginLeft: 8, opacity: 0.8 }} />
        ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  approved: { backgroundColor: colors.successSoft, borderColor: 'rgba(46, 90, 63, 0.20)' },
  pending: { backgroundColor: colors.warningSoft, borderColor: 'rgba(154, 106, 31, 0.22)' },
  rejected: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(155, 44, 44, 0.20)' },
  draft: { backgroundColor: colors.accentSoft, borderColor: colors.border },
  pillText: {
    ...typography.meta,
    color: colors.text,
  },
  info: {
    marginTop: space.sm,
    ...typography.meta,
    color: colors.textSecondary,
  },
  infoCompact: {
    marginTop: 6,
    ...typography.micro,
    color: colors.textSecondary,
    maxWidth: 180,
  },
});


