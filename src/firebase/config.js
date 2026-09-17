import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

export const firebaseConfig = Object.freeze({ ...(globalThis.STOKQR_FIREBASE_CONFIG || {}) });
export const isFirebaseConfigured = ['apiKey','authDomain','projectId','appId'].every(key => {
  const value = String(firebaseConfig[key] || '').trim();
  return value && !value.startsWith('YOUR_');
});

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true }) : null;

if (firebaseAuth) firebaseAuth.useDeviceLanguage();
