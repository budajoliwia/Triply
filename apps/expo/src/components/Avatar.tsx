import { Image, StyleSheet, View, type ImageStyle, type ViewStyle, type StyleProp } from 'react-native';

type Props = {
  size: number;
  uri?: string | null;
  /** Container style (applied to placeholder View) */
  style?: ViewStyle;
  /** Image style (applied to Image). Use this instead of `style` for Image-specific props. */
  imageStyle?: StyleProp<ImageStyle>;
  /** Optional cache-busting token appended as `&v=` */
  cacheBuster?: string | number | null;
};

export function Avatar({ size, uri, style, imageStyle, cacheBuster }: Props) {
  if (!uri) {
    return <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }, style]} />;
  }

  const finalUri =
    cacheBuster !== null && cacheBuster !== undefined
      ? `${uri}${uri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheBuster))}`
      : uri;

  return (
    <Image
      source={{ uri: finalUri }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }, imageStyle]}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#ddd',
  },
  image: {
    backgroundColor: '#eee',
  },
});


