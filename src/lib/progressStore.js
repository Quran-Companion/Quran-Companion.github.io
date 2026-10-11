/**
 * Progress persistence.
 *
 * Two interchangeable adapters with the same interface:
 *  - localAdapter:     guest mode, saved in localStorage on this device.
 *  - firestoreAdapter: signed-in users, saved in Firestore and synced live across devices.
 *
 * Firestore layout
 *   users/{uid}                 { memorized: {"2:255": ms}, reviewedAt: {"2:255": ms},
 *                                 daily: {"2026-10-11": n}, last: {...}, updatedAt }
 *   users/{uid}/reviews/{id}    { at, scope, total, good, hard, again, durationSec, weak: [keys] }
 *
 * One user doc holds at most 6,236 verse keys per map, comfortably under Firestore's 1 MB limit.
 */
import {
  FieldPath,
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export const emptyProgress = () => ({ memorized: {}, reviewedAt: {}, daily: {}, last: null, reviews: [] });

export const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

/** Pure reducer shared by both adapters for optimistic local updates. */
export function applyOp(state, op) {
  const s = { ...state };
  switch (op.type) {
    case 'memorize': {
      const memorized = { ...s.memorized };
      let added = 0;
      for (const k of op.keys) {
        if (op.value) {
          if (!memorized[k]) { memorized[k] = op.at; added++; }
        } else delete memorized[k];
      }
      s.memorized = memorized;
      if (added) {
        const day = todayKey(new Date(op.at));
        s.daily = { ...s.daily, [day]: (s.daily[day] || 0) + added };
      }
      op.added = added;
      return s;
    }
    case 'reviewed': {
      s.reviewedAt = { ...s.reviewedAt };
      for (const k of op.keys) s.reviewedAt[k] = op.at;
      return s;
    }
    case 'last':
      s.last = op.last;
      return s;
    case 'review':
      s.reviews = [op.review, ...s.reviews].slice(0, 100);
      return s;
    default:
      return s;
  }
}

// ---------------- local (guest) ----------------
export function localAdapter(storageKey = 'qc:progress:guest') {
  const read = () => {
    try {
      return { ...emptyProgress(), ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
    } catch {
      return emptyProgress();
    }
  };
  let state = read();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  const onStorage = (e) => {
    if (e.key === storageKey) { state = read(); emit(); }
  };

  return {
    kind: 'local',
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      if (listeners.size === 1) window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(fn);
        if (!listeners.size) window.removeEventListener('storage', onStorage);
      };
    },
    async apply(op) {
      state = applyOp(state, op);
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* quota */ }
      emit();
    },
    snapshot: () => state,
    clear() {
      localStorage.removeItem(storageKey);
      state = emptyProgress();
      emit();
    },
  };
}

// ---------------- Firestore (signed in) ----------------
export function firestoreAdapter(uid) {
  const userRef = doc(db, 'users', uid);
  const reviewsRef = collection(db, 'users', uid, 'reviews');
  let state = emptyProgress();
  let ready = false;
  const listeners = new Set();
  const emit = () => ready && listeners.forEach((fn) => fn(state));

  let unsubs = [];
  function start() {
    unsubs.push(
      onSnapshot(userRef, (snap) => {
        const d = snap.data() || {};
        state = {
          ...state,
          memorized: d.memorized || {},
          reviewedAt: d.reviewedAt || {},
          daily: d.daily || {},
          last: d.last || null,
        };
        ready = true;
        emit();
      }, (err) => console.error('[progress] user doc', err)),
      onSnapshot(query(reviewsRef, orderBy('at', 'desc'), limit(100)), (snap) => {
        state = { ...state, reviews: snap.docs.map((x) => ({ id: x.id, ...x.data() })) };
        emit();
      }, (err) => console.error('[progress] reviews', err)),
    );
  }

  return {
    kind: 'cloud',
    subscribe(fn) {
      listeners.add(fn);
      if (ready) fn(state);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(fn);
        if (!listeners.size) { unsubs.forEach((u) => u()); unsubs = []; }
      };
    },
    async apply(op) {
      // Optimistic update first so the UI responds instantly.
      const next = applyOp(state, op);
      state = next;
      emit();

      const args = [];
      const push = (path, value) => args.push(path, value);
      switch (op.type) {
        case 'memorize':
          for (const k of op.keys) push(new FieldPath('memorized', k), op.value ? op.at : deleteField());
          if (op.added) push(new FieldPath('daily', todayKey(new Date(op.at))), increment(op.added));
          break;
        case 'reviewed':
          for (const k of op.keys) push(new FieldPath('reviewedAt', k), op.at);
          break;
        case 'last':
          push('last', op.last);
          break;
        case 'review': {
          const { id, ...data } = op.review;
          await setDoc(doc(reviewsRef, id), data);
          return;
        }
        default:
          return;
      }
      push('updatedAt', serverTimestamp());
      try {
        await updateDoc(userRef, ...args);
      } catch (e) {
        if (e.code === 'not-found') {
          await setDoc(userRef, { memorized: {}, reviewedAt: {}, daily: {}, last: null }, { merge: true });
          await updateDoc(userRef, ...args);
        } else throw e;
      }
    },
    snapshot: () => state,
  };
}

/**
 * After sign-in, merge any progress the person made as a guest into their account
 * (union of memorized verses, keeping the earliest timestamp), then clear the guest copy.
 */
export async function mergeGuestIntoCloud(uid, guest) {
  const hasGuestData =
    Object.keys(guest.memorized).length || guest.reviews.length || guest.last;
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      memorized: guest.memorized,
      reviewedAt: guest.reviewedAt,
      daily: guest.daily,
      last: guest.last,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (hasGuestData) {
    const cloud = snap.data();
    const memorized = { ...(cloud.memorized || {}) };
    for (const [k, t] of Object.entries(guest.memorized)) memorized[k] = Math.min(memorized[k] || t, t);
    const reviewedAt = { ...(cloud.reviewedAt || {}) };
    for (const [k, t] of Object.entries(guest.reviewedAt)) reviewedAt[k] = Math.max(reviewedAt[k] || 0, t);
    const daily = { ...(cloud.daily || {}) };
    for (const [d, n] of Object.entries(guest.daily)) daily[d] = (daily[d] || 0) + n;
    const last = !cloud.last || (guest.last && guest.last.at > cloud.last.at) ? guest.last : cloud.last;
    await setDoc(userRef, { memorized, reviewedAt, daily, last, updatedAt: serverTimestamp() }, { merge: true });
  }
  if (guest.reviews.length) {
    const batch = writeBatch(db);
    for (const r of guest.reviews.slice(0, 100)) {
      const { id, ...data } = r;
      batch.set(doc(db, 'users', uid, 'reviews', id), data);
    }
    await batch.commit();
  }
  return Boolean(hasGuestData);
}
