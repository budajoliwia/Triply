import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';

type Props = {
  size: number;
  uri?: string | null;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
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
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }, style, imageStyle]}
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


