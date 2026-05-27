import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseEntryOperation } from '../../src/domain/entryParser.js'

const data = {
  accounts: [
    { id: 'business-account', scope: 'business' },
    { id: 'personal-account', scope: 'personal' },
  ],
  catalog: [
    { id: 'item-1', name: 'Produto principal', price: 50 },
    { id: 'item-2', name: 'Atendimento', price: 80 },
  ],
}

describe('entry parser', () => {
  it('parses business income from natural text', () => {
    const drafts = parseEntryOperation({
      text: 'vendi 3 Produto principal por 150',
      data,
      defaultScope: 'business',
    })

    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].type, 'income')
    assert.equal(drafts[0].scope, 'business')
    assert.equal(drafts[0].amount, 150)
    assert.equal(drafts[0].quantity, 3)
    assert.equal(drafts[0].accountId, 'business-account')
  })

  it('parses personal expense and keeps personal scope', () => {
    const drafts = parseEntryOperation({
      text: 'gastei 35 no mercado de casa',
      data,
      defaultScope: 'business',
    })

    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].type, 'expense')
    assert.equal(drafts[0].scope, 'personal')
    assert.equal(drafts[0].amount, 35)
    assert.equal(drafts[0].accountId, 'personal-account')
  })

  it('splits multiple entries in one message', () => {
    const drafts = parseEntryOperation({
      text: 'recebi 200 de cliente e paguei 60 de material',
      data,
      defaultScope: 'business',
    })

    assert.equal(drafts.length, 2)
    assert.equal(drafts[0].type, 'income')
    assert.equal(drafts[1].type, 'expense')
  })
})
