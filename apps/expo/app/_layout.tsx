import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { setupEmulators } from '../src/firebase/client';

export default function RootLayout() {
  useEffect(() => {
    setupEmulators();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
