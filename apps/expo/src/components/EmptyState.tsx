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
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={22} color={colors.textSecondary} />
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
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


