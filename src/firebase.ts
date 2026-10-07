import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore, 
  setLogLevel,
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  collection,
  type Firestore
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';

// Suppress non-fatal Firestore network stream and offline warnings
setLogLevel('error');

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use initializeFirestore with experimentalForceLongPolling to eliminate the 10-second backend timeout
// that occurs with WebChannel streaming in iframes, proxies, and cloud sandbox environments.
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: true,
    },
    firebaseConfigJson.firestoreDatabaseId || undefined
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfigJson.firestoreDatabaseId || undefined);
}

export const db = dbInstance;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const AUTHORIZED_CLOUD_RUN_HOST = 'ais-pre-j7r4naippwnomolthiikmn-567270335497.asia-southeast1.run.app';

export const isAuthorizedNativeDomain = (hostname: string = window.location.hostname): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.ai.studio') ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com')
  );
};

export const loginWithGoogle = async (): Promise<User> => {
  const currentHostname = window.location.hostname;

  // 1. If we are running on an already-whitelisted domain (e.g. Cloud Run, AI Studio, localhost)
  if (isAuthorizedNativeDomain(currentHostname)) {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        console.warn('Popup blocked, attempting redirect sign-in...', error);
        await signInWithRedirect(auth, googleProvider);
        throw new Error('Membuka halaman otorisasi Google...');
      }
      throw error;
    }
  }

  // 2. We are on a custom domain (e.g. karyazainnet.net or www.karyazainnet.net).
  // Because the managed Firebase project restricts adding custom authorized domains,
  // we route through our verified Cloud Run bridge domain which is already authorized!
  return new Promise<User>((resolve, reject) => {
    const bridgeUrl = `https://${AUTHORIZED_CLOUD_RUN_HOST}/?auth_bridge=1&origin=${encodeURIComponent(window.location.origin)}&redirect=${encodeURIComponent(window.location.href)}`;

    const width = 500;
    const height = 660;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      bridgeUrl,
      'zainnet_auth_bridge',
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,scrollbars=yes`
    );

    // If popup was blocked by browser
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Fallback: full-page redirect to bridge
      const redirectUrl = `https://${AUTHORIZED_CLOUD_RUN_HOST}/?auth_bridge=1&origin=${encodeURIComponent(window.location.origin)}&redirect=${encodeURIComponent(window.location.href)}`;
      window.location.href = redirectUrl;
      return;
    }

    let isResolved = false;

    const cleanup = () => {
      window.removeEventListener('message', messageHandler);
      clearInterval(intervalId);
    };

    const messageHandler = async (event: MessageEvent) => {
      if (event.data?.type === 'FIREBASE_AUTH_BRIDGE_SUCCESS') {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        try {
          const { idToken, accessToken } = event.data;
          if (!idToken) {
            throw new Error('Tidak ada token autentikasi Google.');
          }
          const credential = GoogleAuthProvider.credential(idToken, accessToken);
          const userCred = await signInWithCredential(auth, credential);
          resolve(userCred.user);
        } catch (err) {
          reject(err);
        }
      } else if (event.data?.type === 'FIREBASE_AUTH_BRIDGE_ERROR') {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        reject(new Error(event.data.message || 'Login dibatalkan.'));
      }
    };

    window.addEventListener('message', messageHandler);

    const intervalId = setInterval(() => {
      if (popup.closed) {
        clearInterval(intervalId);
        if (!isResolved) {
          isResolved = true;
          window.removeEventListener('message', messageHandler);
          reject(new Error('Jendela login ditutup sebelum selesai. Silakan coba lagi.'));
        }
      }
    }, 1000);
  });
};

export const logoutUser = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

export { onAuthStateChanged, signInWithCredential, GoogleAuthProvider, type User };
