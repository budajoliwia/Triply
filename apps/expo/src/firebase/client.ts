// Firebase client SDK init (Expo + web)
import { getApp, getApps, initializeApp } from 'firebase/app';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Add other Firebase SDKs (Firestore/Storage/Auth) when needed.
