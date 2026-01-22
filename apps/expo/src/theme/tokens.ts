import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  // Surfaces
  bg: '#F6F4EF', // warm off-white
  surface: '#FCFBF8', // slightly warm
  surfaceElevated: '#FFFFFF',
  border: '#E6E1D8',

  // Text
  text: '#1F2A24',
  textSecondary: '#55605A',
  textTertiary: '#7A857E',

  // Brand (travel/nature)
  primary: '#1F3D2B', // deep olive / forest
  primary2: '#2E5A3F',
  primarySoft: 'rgba(31, 61, 43, 0.12)',

  // Accent (sand)
  accent: '#D8C7A6',
  accentSoft: 'rgba(216, 199, 166, 0.28)',

  // Semantic
  success: '#2E5A3F',
  successSoft: 'rgba(46, 90, 63, 0.14)',
  warning: '#9A6A1F',
  warningSoft: 'rgba(154, 106, 31, 0.14)',
  danger: '#9B2C2C',
  dangerSoft: 'rgba(155, 44, 44, 0.12)',

  // UI
  overlay: 'rgba(17, 24, 39, 0.35)',
  skeleton: '#E8E4DC',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  })!,
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
};

export const typography = {
  titleXL: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.text,
  } satisfies TextStyle,
  titleLG: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.15,
    color: colors.text,
  } satisfies TextStyle,
  titleMD: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.05,
    color: colors.text,
  } satisfies TextStyle,
  body: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyEmph: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  } satisfies TextStyle,
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  } satisfies TextStyle,
  micro: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
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


