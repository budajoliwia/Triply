import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors, radius, space, typography } from '../theme';

export function EmptyState({
  title,
  description,
  icon = 'notifications-outline',
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <View style={styles.blobA} />
        <View style={styles.blobB} />
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="primary" size="sm" style={{ marginTop: space.lg }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 84,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  blobA: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accentSoft,
    left: 6,
    top: 4,
  },
  blobB: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(31, 61, 43, 0.08)',
    right: 10,
    bottom: 0,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 20, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleMD,
    textAlign: 'center',
  },
  desc: {
    marginTop: space.xs,
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});


