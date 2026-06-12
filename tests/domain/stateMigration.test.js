import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeAppState } from '../../src/domain/stateMigration.js'

const defaults = {
  person: { name: '', workName: '', mode: 'hybrid' },
  ledgers: [
    { id: 'personal', name: 'Pessoal' },
    { id: 'business', name: 'Negocio' },
  ],
  accounts: [{ id: 'default', ledger: 'personal', name: 'Carteira', balance: 0 }],
  cards: [],
  plan: { id: 'start', tier: 'Norte Start' },
  connections: [],
  automations: [],
  events: [],
  obligations: [],
  recurrences: [],
  budgets: [],
  goals: [],
  assistant: [],
}

describe('state migration', () => {
  it('migrates legacy scope, transactions and bills into the new app model', () => {
    const state = normalizeAppState(
      {
        user: { name: 'Savio', businessName: 'Agencia' },
        accounts: [
          { id: 'pj', name: 'Conta PJ', scope: 'business', balance: 1200 },
          { id: 'pf', name: 'Conta pessoal', scope: 'personal', balance: 300 },
        ],
        transactions: [
          { id: 'sale', scope: 'business', type: 'income', amount: 500, note: 'Cliente', date: '2026-06-12' },
          { id: 'market', scope: 'personal', type: 'expense', amount: 80, title: 'Mercado', date: '2026-06-12' },
        ],
        bills: [
          { id: 'bill', scope: 'business', type: 'payable', amount: 200, title: 'Fornecedor', due: '2026-06-15' },
        ],
      },
      defaults,
      '2026-06-12',
    )

    assert.equal(state.person.name, 'Savio')
    assert.equal(state.accounts[0].ledger, 'business')
    assert.equal(state.accounts[1].ledger, 'personal')
    assert.equal(state.events[0].ledger, 'business')
    assert.equal(state.events[0].title, 'Cliente')
    assert.equal(state.obligations[0].ledger, 'business')
    assert.equal(state.obligations[0].status, 'open')
  })

  it('ignores invalid collection shapes instead of crashing', () => {
    const state = normalizeAppState(
      {
        accounts: { broken: true },
        transactions: null,
        bills: 'invalid',
        cards: {},
      },
      defaults,
      '2026-06-12',
    )

    assert.deepEqual(state.accounts, defaults.accounts)
    assert.deepEqual(state.events, [])
    assert.deepEqual(state.obligations, [])
    assert.deepEqual(state.cards, [])
  })
})
