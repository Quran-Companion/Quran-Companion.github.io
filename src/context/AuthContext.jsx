import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseDisabledReason, firebaseEnabled } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!firebaseEnabled);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      enabled: firebaseEnabled,
      disabledReason: firebaseDisabledReason,
      async signUp({ name, email, password }) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        return cred.user;
      },
      signIn: ({ email, password }) => signInWithEmailAndPassword(auth, email, password),
      signInWithGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
      resetPassword: (email) => sendPasswordResetEmail(auth, email),
      signOut: () => signOut(auth),
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Map Firebase auth error codes to short, human messages. */
export function authErrorMessage(err, lang = 'ar') {
  const code = err?.code || '';
  const m = {
    'auth/invalid-credential': ['البريد أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
    'auth/wrong-password': ['البريد أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
    'auth/user-not-found': ['لا يوجد حساب بهذا البريد.', 'No account with this email.'],
    'auth/email-already-in-use': ['هذا البريد مستخدم بالفعل.', 'This email is already in use.'],
    'auth/weak-password': ['كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'Password must be at least 6 characters.'],
    'auth/invalid-email': ['البريد الإلكتروني غير صالح.', 'Invalid email address.'],
    'auth/popup-closed-by-user': ['أُغلقت نافذة الدخول.', 'Sign-in window was closed.'],
    'auth/network-request-failed': ['تعذّر الاتصال بالشبكة.', 'Network error.'],
    'auth/too-many-requests': ['محاولات كثيرة. حاول لاحقًا.', 'Too many attempts. Try again later.'],
    'auth/popup-blocked': ['المتصفح منع نافذة جوجل. اسمح بالنوافذ المنبثقة لهذا الموقع وحاول مرة أخرى.', 'The browser blocked the Google window. Allow pop-ups for this site and try again.'],
    'auth/cancelled-popup-request': ['أُلغيت نافذة الدخول.', 'Sign-in window was cancelled.'],
    'auth/unauthorized-domain': ['هذا الدومين غير مسموح به في Firebase. أضفه من Authentication ← Settings ← Authorized domains.', 'This domain is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.'],
    'auth/operation-not-allowed': ['طريقة الدخول هذه غير مفعّلة. فعّلها من Authentication ← Sign-in method في Firebase.', 'This sign-in method is disabled. Enable it in Firebase → Authentication → Sign-in method.'],
    'auth/configuration-not-found': ['خدمة Authentication غير مفعّلة في مشروع Firebase.', 'Authentication is not enabled in this Firebase project.'],
    'auth/invalid-api-key': ['مفتاح Firebase (apiKey) غير صحيح. الصق الإعدادات من جديد.', 'The Firebase apiKey is invalid. Paste the settings again.'],
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': ['مفتاح Firebase (apiKey) غير صحيح. الصق الإعدادات من جديد.', 'The Firebase apiKey is invalid. Paste the settings again.'],
  }[code];
  if (m) return lang === 'ar' ? m[0] : m[1];
  // Unknown error: keep the code visible rather than hiding it.
  const base = lang === 'ar' ? 'تعذّر إتمام العملية. حاول مرة أخرى.' : 'Something went wrong. Please try again.';
  return code ? `${base} (${code})` : base;
}
