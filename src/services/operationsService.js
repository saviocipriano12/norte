import { applyPurchaseOperation, applySaleOperation, cancelPurchaseOperation, cancelSaleOperation } from '../domain/norteDomain'
import { callFunction, firebaseEnabled, functions } from '../firebaseClient'

const production = import.meta.env.PROD

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

async function callCloudOperation(name, payload) {
  if (!firebaseEnabled || !functions) throw new Error('Backend Firebase indisponivel.')
  const result = await callFunction(name, payload)
  return result.data
}

async function runFirebaseOperation(name, payload, fallback) {
  try {
    const cloud = await callCloudOperation(name, payload)
    if (cloud?.data) return cloud.data
    throw new Error('Resposta invalida do backend.')
  } catch (error) {
    if (production) throw new Error(error.message || 'Operacao nao confirmada pelo backend.', { cause: error })
    return fallback()
  }
}

export async function createSaleOperation({ data, sale }) {
  if (firebaseEnabled) {
    return runFirebaseOperation('createSale', { state: data, sale }, () => applySaleOperation(data, sale))
  }

  const payload = await fetchJson('/api/sales', {
    method: 'POST',
    body: JSON.stringify({ data, sale }),
  })
  return payload.data
}

export async function cancelSaleService({ data, saleId }) {
  if (firebaseEnabled) {
    return runFirebaseOperation('cancelSale', { state: data, saleId }, () => cancelSaleOperation(data, saleId))
  }

  const payload = await fetchJson('/api/sales/cancel', {
    method: 'POST',
    body: JSON.stringify({ data, saleId }),
  })
  return payload.data
}

export async function createPurchaseOperation({ data, purchase }) {
  if (firebaseEnabled) {
    return runFirebaseOperation('createPurchase', { state: data, purchase }, () => applyPurchaseOperation(data, purchase))
  }

  const payload = await fetchJson('/api/purchases', {
    method: 'POST',
    body: JSON.stringify({ data, purchase }),
  })
  return payload.data
}

export async function cancelPurchaseService({ data, purchaseId }) {
  if (firebaseEnabled) {
    return runFirebaseOperation('cancelPurchase', { state: data, purchaseId }, () => cancelPurchaseOperation(data, purchaseId))
  }

  const payload = await fetchJson('/api/purchases/cancel', {
    method: 'POST',
    body: JSON.stringify({ data, purchaseId }),
  })
  return payload.data
}
