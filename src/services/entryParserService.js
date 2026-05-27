import { parseEntryOperation } from '../domain/entryParser'
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

export async function parseEntry({ text, data, defaultScope }) {
  if (firebaseEnabled && functions) {
    const result = await callFunction('parseEntry', { text, data, defaultScope }).catch((error) => {
      if (production) throw new Error(error.message || 'Nao consegui interpretar pelo backend.')
      return null
    })
    if (result?.data?.drafts) return result.data.drafts
    if (production) throw new Error('Resposta invalida do backend de interpretacao.')
    return parseEntryOperation({ text, data, defaultScope })
  }

  const payload = await fetchJson('/api/parse-entry', {
    method: 'POST',
    body: JSON.stringify({ text, data, defaultScope }),
  }).catch(() => null)
  return payload?.drafts || parseEntryOperation({ text, data, defaultScope })
}
