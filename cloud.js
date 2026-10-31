// Login and cloud sync with Firebase. Bundled into src/cloud.bundle.js by `npm run bundle`.
// Data layout in Firestore (private per account):
//   users/{uid}/contacts/{contactId}   one document per lead/customer
//   users/{uid}/meta/settings          app settings
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager, persistentMultipleTabManager, collection, doc,
  onSnapshot, writeBatch, connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCFsW8RIbcvIhZAdHKhYDs5ib3ZFx3ge8",
  authDomain: "greenglow-landscaping.firebaseapp.com",
  projectId: "greenglow-landscaping",
  storageBucket: "greenglow-landscaping.firebasestorage.app",
  messagingSenderId: "40359048824",
  appId: "1:40359048824:web:5f43d24b459c36faa35f8d",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Local cache: the app keeps working offline and syncs when back online
// In a browser the app may be open in several tabs at once
const tabManager = window.crmAPI?.isWeb ? persistentMultipleTabManager() : persistentSingleTabManager();
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager }) });

// Only used for automated testing against the local Firebase emulator
if (location.hash === "#emulator") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/user-not-found": "No account with that email.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No internet connection.",
  "auth/operation-not-allowed": "Email/password sign-in isn't turned on in Firebase yet.",
};
const friendly = err => new Error(ERRORS[err.code] ?? err.message);
const wrap = fn => (...args) => fn(...args).catch(err => { throw friendly(err); });

// Strip undefined values (Firestore rejects them)
const clean = value => JSON.parse(JSON.stringify(value));

let uid = null;
let unsubscribers = [];
const known = new Map(); // contact id -> JSON as last written/received, so only changes are uploaded
let knownSettings = null;

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) op(batch);
    await batch.commit();
  }
}

window.cloud = {
  onAuth(callback) {
    return onAuthStateChanged(auth, user => callback(user ? { uid: user.uid, email: user.email } : null));
  },
  signIn: wrap((email, password) => signInWithEmailAndPassword(auth, email, password)),
  signUp: wrap((email, password) => createUserWithEmailAndPassword(auth, email, password)),
  resetPassword: wrap(email => sendPasswordResetEmail(auth, email)),
  async signOut() {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
    known.clear();
    knownSettings = null;
    uid = null;
    await signOut(auth);
  },

  // Calls onData({ contacts, settings, fromServer }) on first load and whenever another computer changes something
  subscribe(onData, onError) {
    uid = auth.currentUser.uid;
    let contacts = null, settings = undefined;
    const emit = (fromServer) => {
      if (contacts !== null && settings !== undefined) onData({ contacts: [...contacts.values()], settings, fromServer });
    };
    unsubscribers.push(onSnapshot(collection(db, "users", uid, "contacts"), { includeMetadataChanges: false }, snap => {
      const first = contacts === null;
      contacts ??= new Map();
      let remoteChange = false;
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        if (change.type === "removed") {
          contacts.delete(id);
          if (known.has(id)) { known.delete(id); remoteChange = true; }
        } else {
          const value = change.doc.data();
          contacts.set(id, value);
          const json = JSON.stringify(value);
          if (known.get(id) !== json && !snap.metadata.hasPendingWrites) remoteChange = true;
          known.set(id, json);
        }
      }
      // Our own edits come back here too; only pass on the first load and other computers' changes
      if (first || remoteChange) emit(!snap.metadata.fromCache);
    }, err => onError?.(friendly(err))));
    unsubscribers.push(onSnapshot(doc(db, "users", uid, "meta", "settings"), snap => {
      const first = settings === undefined;
      settings = snap.exists() ? snap.data() : null;
      const json = JSON.stringify(settings);
      const changed = json !== knownSettings;
      knownSettings = json;
      if (first || (changed && !snap.metadata.hasPendingWrites)) emit(!snap.metadata.fromCache);
    }, err => onError?.(friendly(err))));
  },

  // Uploads only what changed since the last sync
  async push(contacts, settings) {
    if (!uid) return;
    const ops = [];
    const ids = new Set();
    for (const c of contacts) {
      ids.add(c.id);
      const value = clean(c);
      const json = JSON.stringify(value);
      if (known.get(c.id) === json) continue;
      known.set(c.id, json);
      ops.push(b => b.set(doc(db, "users", uid, "contacts", c.id), value));
    }
    for (const id of [...known.keys()]) {
      if (ids.has(id)) continue;
      known.delete(id);
      ops.push(b => b.delete(doc(db, "users", uid, "contacts", id)));
    }
    const settingsValue = clean(settings);
    const settingsJson = JSON.stringify(settingsValue);
    if (settingsJson !== knownSettings) {
      knownSettings = settingsJson;
      ops.push(b => b.set(doc(db, "users", uid, "meta", "settings"), settingsValue));
    }
    // Writes go to the local cache immediately and upload in the background (also when offline)
    if (ops.length) commitInChunks(ops).catch(err => console.error("Sync failed:", err));
  },
};
