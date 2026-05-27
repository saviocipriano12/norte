/* global Buffer, process */
import { createServer } from 'node:http'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyPurchaseOperation,
  applySaleOperation,
  cancelPurchaseOperation,
  cancelSaleOperation,
} from '../src/domain/norteDomain.js'
import { parseEntryOperation } from '../src/domain/entryParser.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'state.json')
const AUDIT_FILE = join(DATA_DIR, 'audit.log')
const PORT = Number(process.env.NORTE_API_PORT || 8787)

async function readState() {
  try {
    const content = await readFile(DATA_FILE, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function writeState(state) {
  await mkdir(DATA_DIR, { recursive: true })
  const current = await readState()
  const payload = {
    ...state,
    meta: {
      ...(state.meta || {}),
      savedAt: new Date().toISOString(),
      storage: 'norte-local-api',
    },
  }
  const tempFile = `${DATA_FILE}.tmp`
  await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(tempFile, DATA_FILE)
  await appendAudit(current, payload)
  return payload
}

async function appendAudit(previous, next) {
  const line = {
    at: new Date().toISOString(),
    transactions: next?.transactions?.length || 0,
    previousTransactions: previous?.transactions?.length || 0,
    clients: next?.clients?.length || 0,
    sales: next?.sales?.length || 0,
    suppliers: next?.suppliers?.length || 0,
    purchases: next?.purchases?.length || 0,
    bills: next?.bills?.length || 0,
    catalog: next?.catalog?.length || 0,
  }
  await appendFile(AUDIT_FILE, `${JSON.stringify(line)}\n`, 'utf8')
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {})
      return
    }

    if (request.url === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, service: 'norte-api' })
      return
    }

    if (request.url === '/api/state' && request.method === 'GET') {
      sendJson(response, 200, { data: await readState() })
      return
    }

    if (request.url === '/api/state' && request.method === 'PUT') {
      const body = await readBody(request)
      const saved = await writeState(body.data)
      sendJson(response, 200, { data: saved })
      return
    }

    if (request.url === '/api/parse-entry' && request.method === 'POST') {
      const body = await readBody(request)
      const drafts = parseEntryOperation({ ...body, source: 'api-parser' })
      sendJson(response, 200, { drafts })
      return
    }

    if (request.url === '/api/sales' && request.method === 'POST') {
      const body = await readBody(request)
      const baseState = body.data || (await readState())
      const saved = await writeState(applySaleOperation(baseState, body.sale))
      sendJson(response, 200, { data: saved })
      return
    }

    if (request.url === '/api/purchases' && request.method === 'POST') {
      const body = await readBody(request)
      const baseState = body.data || (await readState())
      const saved = await writeState(applyPurchaseOperation(baseState, body.purchase))
      sendJson(response, 200, { data: saved })
      return
    }

    if (request.url === '/api/sales/cancel' && request.method === 'POST') {
      const body = await readBody(request)
      const baseState = body.data || (await readState())
      const saved = await writeState(cancelSaleOperation(baseState, body.saleId))
      sendJson(response, 200, { data: saved })
      return
    }

    if (request.url === '/api/purchases/cancel' && request.method === 'POST') {
      const body = await readBody(request)
      const baseState = body.data || (await readState())
      const saved = await writeState(cancelPurchaseOperation(baseState, body.purchaseId))
      sendJson(response, 200, { data: saved })
      return
    }

    sendJson(response, 404, { error: 'Endpoint not found' })
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Internal server error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Norte API running at http://127.0.0.1:${PORT}`)
})
