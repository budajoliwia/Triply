import { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Link } from 'expo-router';
import { auth, db } from '../src/firebase/client';
import { UserDoc, ISODateString } from '@triply/shared';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !username) {
      Alert.alert('Error', 'Please enter email, password, and username');
      return;
    }

    setLoading(true);
    try {
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
      const errorMessage = (error as { message?: string }).message || 'An error occurred';
      Alert.alert('Registration Failed', errorMessage);
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
