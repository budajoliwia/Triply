import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  // Surfaces
  bg: '#F3F6F4', // cool, slightly green-tinted off-white (less beige)
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E2E7E4',
  borderStrong: '#CBD5D0',

  // Text
  text: '#0E1511',
  textSecondary: '#3E4A44',
  textTertiary: '#66726C',

  // Brand (travel/nature)
  primary: '#1F3D2B', // deep olive / forest
  primary2: '#2E5A3F',
  primarySoft: 'rgba(31, 61, 43, 0.10)',

  // Accent (soft sage, keeps the nature vibe without beige)
  accent: '#CFE2D6',
  accentSoft: 'rgba(46, 90, 63, 0.09)',

  // Semantic
  success: '#1F6B44',
  successSoft: 'rgba(31, 107, 68, 0.12)',
  warning: '#A4691B',
  warningSoft: 'rgba(164, 105, 27, 0.14)',
  danger: '#B42318',
  dangerSoft: 'rgba(180, 35, 24, 0.12)',

  // UI
  overlay: 'rgba(10, 16, 13, 0.42)',
  skeleton: '#E7ECE9',
  shadow: 'rgba(15, 23, 20, 0.16)',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 3 },
    default: {},
  })!,
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.22,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 16 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
};

export const typography = {
  titleXL: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 32,
    color: colors.text,
  } satisfies TextStyle,
  titleLG: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.25,
    lineHeight: 26,
    color: colors.text,
  } satisfies TextStyle,
  titleMD: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.05,
    lineHeight: 21,
    color: colors.text,
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 22,
  } satisfies TextStyle,
  bodyEmph: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  } satisfies TextStyle,
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
  } satisfies TextStyle,
  micro: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    lineHeight: 14,
  } satisfies TextStyle,
};

export const theme = {
  colors,
  space,
  radius,
  shadow,
  typography,
  hairline,
} as const;


