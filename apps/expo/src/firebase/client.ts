// Firebase client SDK init (Expo + web)
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// IMPORTANT (Expo / Metro):
// Use `require(...)` for Firebase runtime imports to keep `@firebase/app` and
// `@firebase/auth` on the same module instance (avoids
// "Component auth has not been registered yet" crashes).
const firebaseApp = require('@firebase/app') as typeof import('@firebase/app');
const firebaseAuth = require('firebase/auth') as typeof import('firebase/auth');
// Force Firestore CJS build (RN ESM build can cause service registration mismatch in Metro).
const firebaseFirestore = require('@firebase/firestore/dist/index.cjs.js') as typeof import('@firebase/firestore/dist/index.cjs.js');
const firebaseStorage = require('firebase/storage') as typeof import('firebase/storage');

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
export const app = firebaseApp.getApps().length ? firebaseApp.getApp() : firebaseApp.initializeApp(firebaseConfig);

// NOTE:
// For Expo Go / React Native, `getAuth(app)` is the most reliable initialization.
// (`initializeAuth` + persistence can be re-introduced later if needed, but it has caused
// "Component auth has not been registered yet" crashes in some setups.)
export const auth: Auth = firebaseAuth.getAuth(app);
export const db: Firestore = firebaseFirestore.getFirestore(app);
export const storage: FirebaseStorage = firebaseStorage.getStorage(app);

// Toggle this to switch between production and emulators
const USE_EMULATORS = true;

function getEmulatorHost() {
  // Web always uses localhost
  if (Platform.OS === 'web') {
    return 'localhost';
  }

  // Expo Go (Physical Device)
  // Try to get the IP address of the machine running the packager
  const hostUri =
    Constants.expoConfig?.hostUri ||
    // older / alternative field names depending on Expo env
    (Constants as any)?.expoGoConfig?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any)?.manifest?.debuggerHost;
  if (typeof hostUri === 'string' && hostUri) return hostUri.split(':')[0];

  return 'localhost';
}

export function setupEmulators() {
  if (USE_EMULATORS) {
    const host = getEmulatorHost();
    console.log(`Connecting to Firebase Emulators at ${host}...`);

    try {
      // Auth Emulator usually runs on http
      firebaseAuth.connectAuthEmulator(auth, `http://${host}:9099`);
      firebaseFirestore.connectFirestoreEmulator(db, host, 8080);
      firebaseStorage.connectStorageEmulator(storage, host, 9199);
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
