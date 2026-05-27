import { applyPurchaseOperation, applySaleOperation, cancelPurchaseOperation, cancelSaleOperation } from '../domain/norteDomain'
import { callFunction, firebaseEnabled, functions } from '../firebaseClient'

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

async function callCloudOperation(name, payload) {
  if (!firebaseEnabled || !functions) return null
  const result = await callFunction(name, payload)
  return result.data
}

export async function createSaleOperation({ data, sale }) {
  if (firebaseEnabled) {
    const cloud = await callCloudOperation('createSale', { state: data, sale }).catch(() => null)
    if (cloud?.data) return cloud.data
    return applySaleOperation(data, sale)
  }

  const payload = await fetchJson('/api/sales', {
    method: 'POST',
    body: JSON.stringify({ data, sale }),
  })
  return payload.data
}

export async function cancelSaleService({ data, saleId }) {
  if (firebaseEnabled) {
    const cloud = await callCloudOperation('cancelSale', { state: data, saleId }).catch(() => null)
    if (cloud?.data) return cloud.data
    return cancelSaleOperation(data, saleId)
  }

  const payload = await fetchJson('/api/sales/cancel', {
    method: 'POST',
    body: JSON.stringify({ data, saleId }),
  })
  return payload.data
}

export async function createPurchaseOperation({ data, purchase }) {
  if (firebaseEnabled) {
    const cloud = await callCloudOperation('createPurchase', { state: data, purchase }).catch(() => null)
    if (cloud?.data) return cloud.data
    return applyPurchaseOperation(data, purchase)
  }

  const payload = await fetchJson('/api/purchases', {
    method: 'POST',
    body: JSON.stringify({ data, purchase }),
  })
  return payload.data
}

export async function cancelPurchaseService({ data, purchaseId }) {
  if (firebaseEnabled) {
    const cloud = await callCloudOperation('cancelPurchase', { state: data, purchaseId }).catch(() => null)
    if (cloud?.data) return cloud.data
    return cancelPurchaseOperation(data, purchaseId)
  }

  const payload = await fetchJson('/api/purchases/cancel', {
    method: 'POST',
    body: JSON.stringify({ data, purchaseId }),
  })
  return payload.data
}
