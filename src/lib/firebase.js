import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Firebase configuration comes from (in order):
 *  1. build-time env vars (.env.local → VITE_FIREBASE_*), or
 *  2. a config pasted on the Account page (saved in this browser's localStorage).
 * Without either, the app runs in guest mode.
 */
const LOCAL_KEY = 'qc:firebase-config';
const FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isComplete = (c) => Boolean(c && c.apiKey && c.authDomain && c.projectId && c.appId);

/**
 * Parse the snippet from Firebase console → Project settings → Your apps → "SDK setup and configuration".
 * Accepts the JSON object or the `const firebaseConfig = {...}` JavaScript snippet.
 */
export function parseFirebaseConfig(text = '') {
  const out = {};
  for (const f of FIELDS) {
    const m = text.match(new RegExp(`["']?${f}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
    if (m) out[f] = m[1].trim();
  }
  return isComplete(out) ? out : null;
}

function readLocalConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return isComplete(c) ? c : null;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(config));
}
export function clearFirebaseConfig() {
  localStorage.removeItem(LOCAL_KEY);
}

const config = isComplete(envConfig) ? envConfig : readLocalConfig();
/** 'env' | 'local' | null */
export const firebaseConfigSource = isComplete(envConfig) ? 'env' : config ? 'local' : null;
export const firebaseProjectId = config?.projectId || null;

// Firebase Auth needs an http(s) origin; a page opened straight from disk (file://) can't sign in.
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

let app = null;
let auth = null;
let db = null;
let initError = null;
if (config && !isFileProtocol) {
  try {
    app = initializeApp(config);
    auth = getAuth(app);
    // Offline cache lets progress keep saving without a connection and sync later.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.error('[firebase] initialisation failed', e);
    initError = e;
    app = auth = db = null;
  }
}

/** True when Firebase can be used. Otherwise the app runs in guest (local-only) mode. */
export const firebaseEnabled = Boolean(auth);

/** Why Firebase is off: 'file-protocol' | 'not-configured' | 'invalid-config' | null (enabled). */
export const firebaseDisabledReason = firebaseEnabled
  ? null
  : isFileProtocol ? 'file-protocol' : !config ? 'not-configured' : 'invalid-config';
export const firebaseInitError = initError;

if (!firebaseEnabled) {
  console.info(`[firebase] guest mode (${firebaseDisabledReason}) — progress is saved on this device only.`);
}

export { app, auth, db };
