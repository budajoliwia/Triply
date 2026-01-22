import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors, space, typography } from '../theme';

export type ErrorKind = 'offline' | 'permission' | 'timeout' | 'unknown';

const KIND_ICON: Record<ErrorKind, keyof typeof Ionicons.glyphMap> = {
  offline: 'cloud-offline-outline',
  permission: 'lock-closed-outline',
  timeout: 'time-outline',
  unknown: 'alert-circle-outline',
};

export function ErrorState({
  kind = 'unknown',
  title,
  description,
  retryLabel = 'Spróbuj ponownie',
  onRetry,
}: {
  kind?: ErrorKind;
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={KIND_ICON[kind]} size={22} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {onRetry ? <Button label={retryLabel} onPress={onRetry} variant="primary" size="sm" style={{ marginTop: space.lg }} /> : null}
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
    backgroundColor: colors.dangerSoft,
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


