import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, hairline, radius, shadow, space, typography } from '../theme';

export function TextField({
  label,
  hint,
  error,
  left,
  right,
  containerStyle,
  inputStyle,
  ...inputProps
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  left?: ReactNode;
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}) {
  const [focused, setFocused] = useState(false);

  const showError = !!error?.trim();
  const assistive = showError ? error : hint;

  const stateStyle = useMemo(() => {
    if (showError) return styles.fieldError;
    if (focused) return styles.fieldFocused;
    return null;
  }, [focused, showError]);

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.field, stateStyle]}>
        {left ? <View style={styles.affixLeft}>{left}</View> : null}
        <TextInput
          {...inputProps}
          style={[styles.input, inputStyle]}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
        />
        {right ? <View style={styles.affixRight}>{right}</View> : null}
      </View>

      {assistive ? (
        <Text style={[styles.hint, showError ? styles.hintError : null]} numberOfLines={2}>
          {assistive}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.meta,
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: 48,
  },
  fieldFocused: {
    borderColor: 'rgba(31, 61, 43, 0.45)',
    ...shadow.card,
  },
  fieldError: {
    borderColor: 'rgba(180, 35, 24, 0.45)',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    color: colors.text,
  },
  affixLeft: { marginRight: 10 },
  affixRight: { marginLeft: 10 },
  hint: {
    marginTop: space.sm,
    ...typography.micro,
    color: colors.textTertiary,
  },
  hintError: {
    color: colors.danger,
  },
});


