import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyPurchaseOperation,
  applySaleOperation,
  cancelPurchaseOperation,
  cancelSaleOperation,
} from '../../src/domain/norteDomain.js'

function baseState() {
  return {
    accounts: [
      { id: 'business-account', name: 'Conta PJ', scope: 'business', balance: 0 },
      { id: 'personal-account', name: 'Conta pessoal', scope: 'personal', balance: 0 },
    ],
    transactions: [],
    clients: [],
    suppliers: [],
    catalog: [
      {
        id: 'service-1',
        name: 'Consultoria',
        type: 'service',
        price: 500,
        cost: 0,
        stock: null,
        minStock: 0,
      },
      {
        id: 'product-1',
        name: 'Produto A',
        type: 'product',
        price: 100,
        cost: 40,
        stock: 10,
        minStock: 2,
      },
    ],
    bills: [],
    goals: [],
    sales: [],
    purchases: [],
  }
}

describe('norte domain operations', () => {
  it('creates a paid sale with income transaction and stock deduction', () => {
    const next = applySaleOperation(baseState(), {
      clientName: 'Cliente Alfa',
      itemId: 'product-1',
      quantity: 2,
      unitPrice: 120,
      status: 'paid',
      date: '2026-05-27',
    })

    assert.equal(next.sales.length, 1)
    assert.equal(next.sales[0].total, 240)
    assert.equal(next.catalog.find((item) => item.id === 'product-1').stock, 8)
    assert.equal(next.transactions.length, 1)
    assert.equal(next.transactions[0].type, 'income')
    assert.equal(next.transactions[0].accountId, 'business-account')
    assert.equal(next.bills.length, 0)
  })

  it('creates a pending sale with receivable bill and client balance', () => {
    const next = applySaleOperation(baseState(), {
      clientName: 'Cliente Beta',
      itemId: 'service-1',
      quantity: 1,
      unitPrice: 700,
      status: 'pending',
      due: '2026-06-05',
    })

    assert.equal(next.transactions.length, 0)
    assert.equal(next.bills.length, 1)
    assert.equal(next.bills[0].type, 'receivable')
    assert.equal(next.bills[0].amount, 700)
    assert.equal(next.clients[0].receivable, 700)
    assert.equal(next.clients[0].status, 'pending')
  })

  it('cancels a sale and reverses related stock, bills, transactions and client balance', () => {
    const sold = applySaleOperation(baseState(), {
      clientName: 'Cliente Beta',
      itemId: 'product-1',
      quantity: 3,
      unitPrice: 100,
      status: 'pending',
    })
    const next = cancelSaleOperation(sold, sold.sales[0].id)

    assert.equal(next.sales.length, 0)
    assert.equal(next.bills.length, 0)
    assert.equal(next.transactions.length, 0)
    assert.equal(next.catalog.find((item) => item.id === 'product-1').stock, 10)
    assert.equal(next.clients[0].receivable, 0)
    assert.equal(next.clients[0].status, 'active')
  })

  it('creates a paid purchase with expense transaction and stock increase', () => {
    const next = applyPurchaseOperation(baseState(), {
      supplierName: 'Fornecedor A',
      itemId: 'product-1',
      quantity: 5,
      unitCost: 35,
      status: 'paid',
      date: '2026-05-27',
    })

    assert.equal(next.purchases.length, 1)
    assert.equal(next.purchases[0].total, 175)
    assert.equal(next.catalog.find((item) => item.id === 'product-1').stock, 15)
    assert.equal(next.catalog.find((item) => item.id === 'product-1').cost, 35)
    assert.equal(next.transactions.length, 1)
    assert.equal(next.transactions[0].type, 'expense')
    assert.equal(next.bills.length, 0)
  })

  it('creates a pending purchase with payable bill and supplier balance', () => {
    const next = applyPurchaseOperation(baseState(), {
      supplierName: 'Fornecedor B',
      itemId: 'product-1',
      quantity: 4,
      unitCost: 30,
      status: 'pending',
      due: '2026-06-10',
    })

    assert.equal(next.transactions.length, 0)
    assert.equal(next.bills.length, 1)
    assert.equal(next.bills[0].type, 'payable')
    assert.equal(next.bills[0].amount, 120)
    assert.equal(next.suppliers[0].payable, 120)
  })

  it('cancels a purchase and reverses stock, bills, transactions and supplier balance', () => {
    const bought = applyPurchaseOperation(baseState(), {
      supplierName: 'Fornecedor B',
      itemId: 'product-1',
      quantity: 4,
      unitCost: 30,
      status: 'pending',
    })
    const next = cancelPurchaseOperation(bought, bought.purchases[0].id)

    assert.equal(next.purchases.length, 0)
    assert.equal(next.bills.length, 0)
    assert.equal(next.transactions.length, 0)
    assert.equal(next.catalog.find((item) => item.id === 'product-1').stock, 10)
    assert.equal(next.suppliers[0].payable, 0)
  })
})
