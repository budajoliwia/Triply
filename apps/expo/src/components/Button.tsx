import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { colors, hairline, radius, shadow, space, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  style,
  left,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
}) {
  const isDisabled = !!disabled || !!loading || !onPress;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed, hovered }) => [
        styles.base,
        stylesByVariant[variant],
        stylesBySize[size],
        hovered && !isDisabled ? styles.hovered : null,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      android_ripple={{ color: rippleByVariant[variant], borderless: false }}
    >
      <View style={styles.row}>
        {left ? <View style={styles.left}>{left}</View> : null}
        {loading ? (
          <ActivityIndicator size="small" color={textColorByVariant[variant]} />
        ) : (
          <Text style={[styles.label, { color: textColorByVariant[variant] }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const stylesByVariant = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    borderWidth: hairline,
    borderColor: 'rgba(255,255,255,0.14)',
    ...shadow.card,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  destructive: {
    backgroundColor: colors.danger,
    borderWidth: hairline,
    borderColor: 'rgba(255,255,255,0.16)',
    ...shadow.card,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: hairline,
    borderColor: 'transparent',
  },
});

const textColorByVariant: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: colors.primary,
  destructive: '#FFFFFF',
  ghost: colors.primary,
};

const rippleByVariant: Record<Variant, string> = {
  primary: 'rgba(255,255,255,0.16)',
  secondary: 'rgba(31, 61, 43, 0.10)',
  destructive: 'rgba(255,255,255,0.18)',
  ghost: 'rgba(31, 61, 43, 0.10)',
};

const stylesBySize = StyleSheet.create({
  sm: { paddingHorizontal: space.lg, paddingVertical: 10, minHeight: 38 },
  md: { paddingHorizontal: space.xl, paddingVertical: 12, minHeight: 44 },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  left: { marginRight: 8 },
  label: {
    ...typography.bodyEmph,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  hovered: { opacity: 0.96 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});


