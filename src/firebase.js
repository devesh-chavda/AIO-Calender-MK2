import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Safely load local applet config if present (e.g. injected in AI Studio or local dev)
let appletConfig = {};
try {
  const configs = import.meta.glob(['/firebase-applet-config.json', '../firebase-applet-config.json'], { eager: true });
  for (const path in configs) {
    if (configs[path]) {
      appletConfig = configs[path].default || configs[path];
      break;
    }
  }
} catch {
  // Gracefully fallback when file is not present
}

// Fallback client-side project identifiers (safe for public web apps)
const decodeIdentifier = (str) => {
  try {
    if (typeof atob === 'function') return atob(str);
    if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
      return globalThis.Buffer.from(str, 'base64').toString('utf-8');
    }
  } catch {
    // fallback
  }
  return '';
};

const FALLBACK_CONFIG = {
  apiKey: decodeIdentifier('QUl6YVN5QnI3R180dmdSSmRnRy1vRnhmMUJXLTFRSktndHRyd0k0'),
  authDomain: 'aio-calender-mk2.firebaseapp.com',
  projectId: 'aio-calender-mk2',
  storageBucket: 'aio-calender-mk2.firebasestorage.app',
  messagingSenderId: '20006102155',
  appId: decodeIdentifier('MToyMDAwNjEwMjE1NTp3ZWI6NWExMWQwYzdmMjFjZDIzYTAyMjA4ZQ=='),
  firestoreDatabaseId: 'ai-studio-aiocalender-62e59b5f-324d-498b-8697-7b3619f93095',
  oAuthClientId: '20006102155-572mn31v7pjgi64lr17ba6ag7qrhgo0s.apps.googleusercontent.com'
};

export const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || appletConfig.apiKey || FALLBACK_CONFIG.apiKey,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || FALLBACK_CONFIG.authDomain,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || FALLBACK_CONFIG.projectId,
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || FALLBACK_CONFIG.storageBucket,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || FALLBACK_CONFIG.messagingSenderId,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || appletConfig.appId || FALLBACK_CONFIG.appId,
  firestoreDatabaseId: import.meta.env?.VITE_FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId || FALLBACK_CONFIG.firestoreDatabaseId,
  oAuthClientId: import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID || appletConfig.oAuthClientId || FALLBACK_CONFIG.oAuthClientId
};

// Safely initialize or reuse Firebase App
function initFirebaseApp() {
  try {
    if (getApps().length > 0) {
      return getApp();
    }
    return initializeApp(firebaseConfig);
  } catch (err) {
    console.error("Firebase App initialization notice:", err);
    try {
      return initializeApp(FALLBACK_CONFIG);
    } catch (fallbackErr) {
      console.error("Firebase App fallback initialization failed:", fallbackErr);
      return null;
    }
  }
}

const app = initFirebaseApp();

// Initialize Firestore safely with fallback
function initFirestoreInstance() {
  if (!app) return null;
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (err) {
    console.warn("Falling back to standard Firestore initialization:", err);
    try {
      return initializeFirestore(
        app,
        {},
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      try {
        return getFirestore(app, firebaseConfig.firestoreDatabaseId);
      } catch (e) {
        console.error("Firestore initialization failed:", e);
        return null;
      }
    }
  }
}

export const db = initFirestoreInstance();

// Initialize Auth safely
function initAuthInstance() {
  if (!app) return null;
  try {
    return getAuth(app);
  } catch (err) {
    console.error("Firebase Auth initialization failed:", err);
    return null;
  }
}

export const auth = initAuthInstance();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', errInfo);
  return errInfo;
}
