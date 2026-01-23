import { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from '@firebase/firestore/dist/index.cjs.js';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../src/firebase/client';
import { UserDoc, ISODateString } from '@triply/shared';
import { Button } from '../src/components/Button';
import { SurfaceCard } from '../src/components/SurfaceCard';
import { TextField } from '../src/components/TextField';
import { colors, space, typography } from '../src/theme';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !username || !confirmPassword) {
      Alert.alert('Błąd', 'Proszę wypełnić wszystkie pola');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Błąd', 'Nieprawidłowy adres email');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Błąd', 'Hasło musi mieć co najmniej 6 znaków');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Błąd', 'Hasła nie są identyczne');
      return;
    }

    if (email === username) {
      Alert.alert('Błąd', 'Email i nazwa użytkownika nie mogą być takie same');
      return;
    }

    setLoading(true);
    try {
      // Check for unique username
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        Alert.alert('Błąd', 'Nazwa użytkownika jest już zajęta');
        setLoading(false);
        return;
      }

      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create User Document
      const now = new Date();
      const todayString = now.toISOString().split('T')[0] as ISODateString;

      const newUserDoc: UserDoc = {
        email: user.email!,
        username: username,
        usernameLower: username.toLowerCase(),
        role: 'user',
        dailyPostLimit: 5,
        usedToday: 0,
        lastUsageDate: todayString,
        createdAt: serverTimestamp(),
        followersCount: 0,
        followingCount: 0,
      };

      await setDoc(doc(db, 'users', user.uid), newUserDoc);

      // Auth listener in _layout will handle redirect
    } catch (error: unknown) {
      console.error(error);
      const code = (error as { code?: string }).code;
      let errorMessage = 'Wystąpił błąd podczas rejestracji';

      if (code === 'auth/email-already-in-use') {
        errorMessage = 'Ten adres email jest już zarejestrowany.';
      } else if (code === 'auth/invalid-email') {
        errorMessage = 'Nieprawidłowy format adresu email.';
      } else if (code === 'auth/weak-password') {
        errorMessage = 'Hasło jest zbyt słabe.';
      } else if (code === 'auth/network-request-failed') {
        errorMessage = 'Błąd sieci. Sprawdź połączenie z internetem.';
      } else if ((error as { message?: string }).message) {
        errorMessage = (error as { message?: string }).message!;
      }

      Alert.alert('Rejestracja nieudana', errorMessage);
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
          <Text style={styles.title}>Utwórz konto</Text>
          <Text style={styles.subtitle}>Spokojnie — to zajmie chwilę</Text>
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
            label="Nazwa użytkownika"
            placeholder="np. janpodrozuje"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            left={<Ionicons name="at-outline" size={18} color={colors.textSecondary} />}
          />

          <View style={{ height: space.lg }} />
          <TextField
            label="Hasło"
            placeholder="Minimum 6 znaków"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            left={<Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />}
          />

          <View style={{ height: space.lg }} />
          <TextField
            label="Powtórz hasło"
            placeholder="Jeszcze raz"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            left={<Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />}
          />

          <Button label="Zarejestruj" onPress={handleRegister} loading={loading} disabled={loading} style={{ marginTop: space.xl }} />

          <Link href="/login" asChild>
            <Text style={styles.link}>Masz już konto? Zaloguj się</Text>
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
