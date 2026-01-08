// Firebase client SDK init (Expo + web)
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBk5eiE3fmZXFtGE3FJITYL1HRdSAGHiho',
  authDomain: 'triply-4eb0c.firebaseapp.com',
  projectId: 'triply-4eb0c',
  storageBucket: 'triply-4eb0c.firebasestorage.app',
  messagingSenderId: '100382655526',
  appId: '1:100382655526:web:bca3c9bce8f013c59bd2e7',
  measurementId: 'G-PW9VXRR6JE',
};

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Toggle this to switch between production and emulators
const USE_EMULATORS = true;

function getEmulatorHost() {
  // Web always uses localhost
  if (Platform.OS === 'web') {
    return 'localhost';
  }

  // Expo Go (Physical Device)
  // Try to get the IP address of the machine running the packager
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }

  return 'localhost';
}

export function setupEmulators() {
  if (USE_EMULATORS) {
    const host = getEmulatorHost();
    console.log(`Connecting to Firebase Emulators at ${host}...`);

    try {
      // Auth Emulator usually runs on http
      connectAuthEmulator(auth, `http://${host}:9099`);
      connectFirestoreEmulator(db, host, 8080);
      connectStorageEmulator(storage, host, 9199);
      console.log('Connected to Firebase Emulators');
    } catch (e) {
      const error = e as { code?: string; message?: string };
      // Ignore "already connected" errors which might happen during fast refresh
      if (error.code !== 'auth/emulator-config-failed' && !error.message?.includes('already')) {
        console.warn('Error connecting to emulators:', error);
      }
    }
  }
}
