import { View, type ViewStyle } from 'react-native';

export function SkeletonBlock({
  width,
  height,
  radius = 10,
  style,
}: {
  width?: number | string;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: radius,
          backgroundColor: '#E9E9E9',
          overflow: 'hidden',
        },
        style,
      ]}
    />
  );
}


