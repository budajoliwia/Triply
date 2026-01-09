import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { setupEmulators } from '../src/firebase/client';
import { AuthProvider, useAuth } from '../src/context/auth';

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthRoute = segments[0] === 'login' || segments[0] === 'register';

    if (!user && !inAuthRoute) {
      // Redirect to login if not authenticated and not on login/register page
      router.replace('/login');
    } else if (user && inAuthRoute) {
      // Redirect to home if authenticated and on login/register page
      router.replace('/(tabs)/feed');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  useEffect(() => {
    setupEmulators();
  }, []);

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
