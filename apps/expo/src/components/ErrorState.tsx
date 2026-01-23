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
      <View style={styles.iconWrap}>
        <View style={styles.blobA} />
        <View style={styles.blobB} />
        <View style={styles.iconCircle}>
          <Ionicons name={KIND_ICON[kind]} size={22} color={colors.danger} />
        </View>
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
    backgroundColor: colors.dangerSoft,
    left: 6,
    top: 4,
  },
  blobB: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 20, 0.06)',
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


