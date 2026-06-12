import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildBudgetRhythm, buildCommitments, buildSmartAlerts, createMonthlyReport, monthKey } from '../../src/domain/financeProjection.js'

describe('finance projection', () => {
  it('summarizes the current month by income, expense and ledger', () => {
    const report = createMonthlyReport(
      [
        { type: 'income', ledger: 'business', amount: 1200, date: '2026-06-03' },
        { type: 'expense', ledger: 'business', amount: 300, date: '2026-06-04' },
        { type: 'expense', ledger: 'personal', amount: 100, date: '2026-06-05' },
        { type: 'income', ledger: 'personal', amount: 999, date: '2026-05-30' },
      ],
      [{ label: 'Operacao', amount: 300 }],
      '2026-06-11',
    )

    assert.equal(report.income, 1200)
    assert.equal(report.expense, 400)
    assert.equal(report.net, 800)
    assert.equal(report.business, 900)
    assert.equal(report.personal, -100)
    assert.equal(report.topCategory.label, 'Operacao')
  })

  it('orders open bills, recurring items and installments as commitments', () => {
    const commitments = buildCommitments({
      currentDate: '2026-06-11',
      upcoming: [{ id: 'bill', title: 'Boleto', type: 'payable', amount: 80, ledger: 'personal', due: '2026-06-12' }],
      recurrences: [{ id: 'rent', title: 'Aluguel', active: true, type: 'payable', amount: 1500, ledger: 'personal', day: 5 }],
      installmentEvents: [{ id: 'cam', title: 'Camera', amount: 1800, installmentAmount: 300, installments: 6, ledger: 'business', date: '2026-06-01' }],
    })

    assert.deepEqual(commitments.map((item) => item.id), ['cam', 'rent', 'bill'])
    assert.equal(commitments[0].label, '6 parcelas')
    assert.equal(commitments[1].label, 'fixo dia 5')
    assert.equal(commitments[2].label, 'a pagar')
  })

  it('creates stable month keys', () => {
    assert.equal(monthKey('2026-06-30'), '2026-06')
  })

  it('calculates category budget rhythm for the current month', () => {
    const rhythm = buildBudgetRhythm({
      currentDate: '2026-06-11',
      budgets: [
        { id: 'market', ledger: 'personal', category: 'Mercado', label: 'Mercado', limit: 500 },
        { id: 'ads', ledger: 'business', category: 'Marketing', label: 'Marketing', limit: 400 },
      ],
      events: [
        { type: 'expense', ledger: 'personal', category: 'Mercado', amount: 120, date: '2026-06-01' },
        { type: 'expense', ledger: 'personal', category: 'Mercado', amount: 430, date: '2026-06-05' },
        { type: 'expense', ledger: 'business', category: 'Marketing', amount: 100, date: '2026-05-30' },
      ],
    })

    assert.equal(rhythm[0].id, 'market')
    assert.equal(rhythm[0].used, 550)
    assert.equal(rhythm[0].left, 0)
    assert.equal(rhythm[0].percent, 110)
    assert.equal(rhythm[0].tone, 'danger')
    assert.equal(rhythm[1].used, 0)
  })

  it('builds smart alerts from financial pressure', () => {
    const alerts = buildSmartAlerts({
      currentDate: '2026-06-11',
      upcoming: [{ id: 'bill', title: 'Fornecedor', type: 'payable', amount: 500, status: 'open', due: '2026-06-11' }],
      safeToSpend: 20,
      monthlyCommitment: 1000,
      cardDebt: 300,
      installmentMonthly: 120,
      report: { income: 800, expense: 1100 },
      moneyMap: [{ label: 'Marketing', percent: 52 }],
      budgetRhythm: [{ id: 'market', label: 'Mercado', percent: 96, left: 20 }],
    })

    assert.equal(alerts.length, 4)
    assert.equal(alerts[0].id, 'due-now')
    assert.equal(alerts.some((alert) => alert.id === 'low-safe'), true)
    assert.equal(alerts.some((alert) => alert.id === 'card-debt'), true)
  })
})
