import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

const app = firebaseEnabled ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app) : null

const WORKSPACE_COLLECTIONS = [
  'accounts',
  'transactions',
  'clients',
  'suppliers',
  'catalog',
  'bills',
  'goals',
  'sales',
  'purchases',
]

export function watchAuth(callback) {
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function logoutFirebase() {
  return signOut(auth)
}

function stateRef(userId) {
  return doc(db, 'users', userId, 'workspaces', 'default')
}

function workspaceIdFor(userId) {
  return `${userId}_default`
}

export async function loadFirebaseState(userId) {
  const snapshot = await getDoc(stateRef(userId))
  const legacyState = snapshot.exists() ? snapshot.data().state : null
  const workspaceId = workspaceIdFor(userId)
  const collectionEntries = await Promise.all(
    WORKSPACE_COLLECTIONS.map(async (key) => [key, await readWorkspaceCollection(workspaceId, key)]),
  )
  const collections = Object.fromEntries(collectionEntries.filter(([, items]) => items.length > 0))
  return legacyState ? { ...legacyState, ...collections } : Object.keys(collections).length ? collections : null
}

export async function saveFirebaseState(userId, state) {
  const workspaceId = workspaceIdFor(userId)
  await ensureWorkspace(userId, workspaceId, state)
  await Promise.all(WORKSPACE_COLLECTIONS.map((key) => syncWorkspaceCollection(workspaceId, key, state[key] || [])))
  await setDoc(
    stateRef(userId),
    {
      state,
      updatedAt: serverTimestamp(),
      version: 2,
    },
    { merge: true },
  )
  return state
}

async function ensureWorkspace(userId, workspaceId, state) {
  await setDoc(
    doc(db, 'users', userId),
    {
      defaultWorkspaceId: workspaceId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await setDoc(
    doc(db, 'workspaces', workspaceId),
    {
      ownerId: userId,
      name: state.user?.businessName || 'Meu negócio',
      profile: state.user?.profile || 'hybrid',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await setDoc(
    doc(db, 'workspaces', workspaceId, 'members', userId),
    {
      role: 'owner',
      userId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

async function readWorkspaceCollection(workspaceId, key) {
  const snapshot = await getDocs(collection(db, 'workspaces', workspaceId, key))
  return snapshot.docs
    .map((document) => {
      const data = document.data()
      const order = data._norteOrder
      delete data._norteOrder
      return { id: document.id, ...data, _norteOrder: order }
    })
    .sort((a, b) => Number(a._norteOrder || 0) - Number(b._norteOrder || 0))
    .map((item) => {
      const next = { ...item }
      delete next._norteOrder
      return next
    })
}

async function syncWorkspaceCollection(workspaceId, key, items) {
  const workspaceCollection = collection(db, 'workspaces', workspaceId, key)
  const snapshot = await getDocs(workspaceCollection)
  const currentIds = new Set(items.filter((item) => item?.id).map((item) => item.id))
  const actions = []

  snapshot.docs.forEach((document) => {
    if (!currentIds.has(document.id)) actions.push((batch) => batch.delete(document.ref))
  })

  items.forEach((item, index) => {
    if (!item?.id) return
    actions.push((batch) =>
      batch.set(doc(db, 'workspaces', workspaceId, key, item.id), cleanForFirestore({ ...item, _norteOrder: index }), {
        merge: false,
      }),
    )
  })

  await commitBatches(actions)
}

async function commitBatches(actions) {
  for (let index = 0; index < actions.length; index += 450) {
    const batch = writeBatch(db)
    actions.slice(index, index + 450).forEach((action) => action(batch))
    await batch.commit()
  }
}

function cleanForFirestore(value) {
  return JSON.parse(JSON.stringify(value))
}

export function callFunction(name, payload) {
  return httpsCallable(functions, name)(payload)
}
