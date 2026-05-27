import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  applyPurchaseOperation,
  applySaleOperation,
  cancelPurchaseOperation,
  cancelSaleOperation,
} from './domain.js'
import { parseEntryOperation } from './entryParser.js'

initializeApp()

const db = getFirestore()

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

function requireUser(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faca login para continuar.')
  return request.auth.uid
}

function workspaceIdFor(uid, workspaceId) {
  return workspaceId || `${uid}_default`
}

function legacyWorkspaceRef(uid) {
  return db.collection('users').doc(uid).collection('workspaces').doc('default')
}

async function loadState(uid, workspaceId) {
  const snapshot = await legacyWorkspaceRef(uid).get()
  const legacyState = snapshot.exists ? snapshot.data().state : null
  const collectionEntries = await Promise.all(
    WORKSPACE_COLLECTIONS.map(async (key) => [key, await readWorkspaceCollection(workspaceId, key)]),
  )
  const collections = Object.fromEntries(collectionEntries.filter(([, items]) => items.length > 0))
  return legacyState ? { ...legacyState, ...collections } : Object.keys(collections).length ? collections : null
}

async function saveState(uid, workspaceId, previousState, nextState, action) {
  await ensureWorkspace(uid, workspaceId, nextState)
  await Promise.all(WORKSPACE_COLLECTIONS.map((key) => syncWorkspaceCollection(workspaceId, key, nextState[key] || [])))
  await legacyWorkspaceRef(uid).set(
    {
      state: nextState,
      updatedAt: FieldValue.serverTimestamp(),
      version: 2,
      lastAction: action,
    },
    { merge: true },
  )
  await writeAuditLog(uid, workspaceId, action, previousState, nextState)
  return nextState
}

async function runOperation(request, action, operation) {
  const uid = requireUser(request)
  const workspaceId = workspaceIdFor(uid, request.data?.workspaceId)
  const state = request.data?.state || (await loadState(uid, workspaceId))
  if (!state) throw new HttpsError('failed-precondition', 'Workspace nao encontrado.')
  const nextState = operation(state)
  await saveState(uid, workspaceId, state, nextState, action)
  return { data: nextState }
}

async function ensureWorkspace(uid, workspaceId, state) {
  await db.collection('users').doc(uid).set(
    {
      defaultWorkspaceId: workspaceId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await db.collection('workspaces').doc(workspaceId).set(
    {
      ownerId: uid,
      name: state.user?.businessName || 'Meu negocio',
      profile: state.user?.profile || 'hybrid',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(uid).set(
    {
      role: 'owner',
      userId: uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function readWorkspaceCollection(workspaceId, key) {
  const snapshot = await db.collection('workspaces').doc(workspaceId).collection(key).get()
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
  const collectionRef = db.collection('workspaces').doc(workspaceId).collection(key)
  const snapshot = await collectionRef.get()
  const currentIds = new Set(items.filter((item) => item?.id).map((item) => item.id))
  const actions = []

  snapshot.docs.forEach((document) => {
    if (!currentIds.has(document.id)) actions.push((batch) => batch.delete(document.ref))
  })

  items.forEach((item, index) => {
    if (!item?.id) return
    actions.push((batch) => batch.set(collectionRef.doc(item.id), cleanForFirestore({ ...item, _norteOrder: index })))
  })

  await commitBatches(actions)
}

async function commitBatches(actions) {
  for (let index = 0; index < actions.length; index += 450) {
    const batch = db.batch()
    actions.slice(index, index + 450).forEach((action) => action(batch))
    await batch.commit()
  }
}

function cleanForFirestore(value) {
  return JSON.parse(JSON.stringify(value))
}

async function writeAuditLog(uid, workspaceId, action, previousState, nextState) {
  await db.collection('workspaces').doc(workspaceId).collection('auditLogs').add({
    action,
    userId: uid,
    createdAt: FieldValue.serverTimestamp(),
    previous: summarizeState(previousState),
    next: summarizeState(nextState),
  })
}

function summarizeState(state) {
  return {
    transactions: state?.transactions?.length || 0,
    sales: state?.sales?.length || 0,
    purchases: state?.purchases?.length || 0,
    clients: state?.clients?.length || 0,
    suppliers: state?.suppliers?.length || 0,
    bills: state?.bills?.length || 0,
    catalog: state?.catalog?.length || 0,
    goals: state?.goals?.length || 0,
  }
}

export const createSale = onCall((request) =>
  runOperation(request, 'createSale', (state) => applySaleOperation(state, request.data.sale)),
)

export const cancelSale = onCall((request) =>
  runOperation(request, 'cancelSale', (state) => cancelSaleOperation(state, request.data.saleId)),
)

export const createPurchase = onCall((request) =>
  runOperation(request, 'createPurchase', (state) => applyPurchaseOperation(state, request.data.purchase)),
)

export const cancelPurchase = onCall((request) =>
  runOperation(request, 'cancelPurchase', (state) => cancelPurchaseOperation(state, request.data.purchaseId)),
)

export const parseEntry = onCall((request) => {
  requireUser(request)
  return {
    drafts: parseEntryOperation({
      text: request.data?.text,
      data: request.data?.data,
      defaultScope: request.data?.defaultScope,
      source: 'cloud-parser',
    }),
  }
})
