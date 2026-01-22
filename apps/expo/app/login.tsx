import { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Alert, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Link } from 'expo-router';
import { auth } from '../src/firebase/client';
import { Button } from '../src/components/Button';
import { SurfaceCard } from '../src/components/SurfaceCard';
import { colors, hairline, radius, space, typography } from '../src/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth listener in _layout will handle redirect
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = (error as { message?: string }).message || 'An error occurred';
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <Text style={styles.title}>Triply</Text>
          <Text style={styles.subtitle}>Zaloguj się, aby kontynuować</Text>
        </View>

        <SurfaceCard style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="np. jan@triply.com"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Hasło</Text>
          <TextInput
            style={styles.input}
            placeholder="Twoje hasło"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button label="Zaloguj" onPress={handleLogin} loading={loading} disabled={loading} style={{ marginTop: space.xl }} />

          <Link href="/register" asChild>
            <Text style={styles.link}>Nie masz konta? Zarejestruj się</Text>
          </Link>
        </SurfaceCard>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    ...typography.body,
  },
  header: {
    paddingHorizontal: space['2xl'],
    paddingTop: space['3xl'],
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  title: {
    ...typography.titleXL,
    color: colors.primary,
  },
  subtitle: {
    marginTop: space.sm,
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    marginHorizontal: space.lg,
    padding: space['2xl'],
  },
  label: {
    ...typography.meta,
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  link: {
    marginTop: space.lg,
    textAlign: 'center',
    ...typography.meta,
    color: colors.primary,
  },
});
