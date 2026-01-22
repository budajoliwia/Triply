import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';
import { colors } from '../theme';

export function SkeletonBlock({
  width,
  height,
  radius = 10,
  style,
  animated = true,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
  animated?: boolean;
}) {
  const opacity = useRef(new Animated.Value(0.65)).current;
  const anim = useMemo(
    () =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.65, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    [opacity],
  );

  useEffect(() => {
    if (!animated) return;
    anim.start();
    return () => anim.stop();
  }, [anim, animated]);

  const Block = animated ? Animated.View : View;
  return (
    <Block
      style={[
        {
          width: width ?? '100%' as const,
          height,
          borderRadius: radius,
          backgroundColor: colors.skeleton,
          overflow: 'hidden',
          ...(animated ? { opacity } : null),
        },
        style,
      ]}
    />
  );
}


