import type { ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, hairline, radius, shadow } from '../theme';

export function SurfaceCard({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: 'rgba(15, 23, 20, 0.08)',
    ...shadow.card,
  },
});


