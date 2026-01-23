import { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../src/firebase/client';
import { Button } from '../src/components/Button';
import { SurfaceCard } from '../src/components/SurfaceCard';
import { TextField } from '../src/components/TextField';
import { colors, space, typography } from '../src/theme';

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
          <View style={styles.brandMark}>
            <View style={styles.brandMarkInner}>
              <Ionicons name="leaf" size={18} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.title}>Triply</Text>
          <Text style={styles.subtitle}>Zaloguj się, aby kontynuować</Text>
        </View>

        <SurfaceCard style={styles.card}>
          <TextField
            label="Email"
            placeholder="np. jan@triply.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            left={<Ionicons name="mail-outline" size={18} color={colors.textSecondary} />}
          />

          <View style={{ height: space.lg }} />
          <TextField
            label="Hasło"
            placeholder="Twoje hasło"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            left={<Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />}
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
  header: {
    paddingHorizontal: space['2xl'],
    paddingTop: space['4xl'],
    paddingBottom: space['2xl'],
    alignItems: 'center',
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 20, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  brandMarkInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 20, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
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
  link: {
    marginTop: space.lg,
    textAlign: 'center',
    ...typography.meta,
    color: colors.primary,
  },
});
