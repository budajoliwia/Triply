import { View, Text, Button, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../src/firebase/client';
import { useAuth } from '../src/context/auth';
import { router } from 'expo-router';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Triply UI Demo</Text>

      <View style={styles.buttonContainer}>
        <Button title="Przejdź do aplikacji (Demo)" onPress={() => router.push('/(tabs)/feed')} />
      </View>

      {user ? (
        <>
          <Text style={styles.email}>Zalogowany jako: {user.email}</Text>
          <Button title="Wyloguj" onPress={() => signOut(auth)} color="#ff4444" />
        </>
      ) : (
        <View style={styles.authButtons}>
          <Button title="Zaloguj się" onPress={() => router.push('/login')} />
          <View style={{ height: 10 }} />
          <Button title="Zarejestruj się" onPress={() => router.push('/register')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  email: {
    fontSize: 16,
    marginBottom: 20,
    color: '#666',
    marginTop: 20,
  },
  buttonContainer: {
    marginBottom: 40,
    width: '100%',
  },
  authButtons: {
    width: '100%',
    marginTop: 20,
  },
});
