import { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { Link } from 'expo-router';
import { auth, db } from '../src/firebase/client';
import { UserDoc, ISODateString } from '@triply/shared';

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
        role: 'user',
        dailyPostLimit: 5,
        usedToday: 0,
        lastUsageDate: todayString,
        createdAt: serverTimestamp(),
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
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Register" onPress={handleRegister} />
      )}

      <Link href="/login" asChild>
        <Text style={styles.link}>Already have an account? Login</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  link: {
    marginTop: 15,
    color: 'blue',
    textAlign: 'center',
  },
});
