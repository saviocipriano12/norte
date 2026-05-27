import { parseEntryOperation } from '../domain/entryParser'
import { callFunction, firebaseEnabled, functions } from '../firebaseClient'

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

export async function parseEntry({ text, data, defaultScope }) {
  if (firebaseEnabled && functions) {
    const result = await callFunction('parseEntry', { text, data, defaultScope }).catch(() => null)
    if (result?.data?.drafts) return result.data.drafts
    return parseEntryOperation({ text, data, defaultScope })
  }

  const payload = await fetchJson('/api/parse-entry', {
    method: 'POST',
    body: JSON.stringify({ text, data, defaultScope }),
  }).catch(() => null)
  return payload?.drafts || parseEntryOperation({ text, data, defaultScope })
}
