import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
        <Ionicons name={KIND_ICON[kind]} size={22} color="#b00020" />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {onRetry ? (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
  },
  desc: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    marginTop: 14,
    backgroundColor: '#007AFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: {
    color: '#fff',
    fontWeight: '800',
  },
});


