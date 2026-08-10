import assert from 'node:assert/strict';
import { applyMovementToAccounts, parseCurrencyInput, parseFinanceMessage } from '../src/financeEngine.ts';
import { initialAccounts } from '../src/mockData.ts';

const result = parseFinanceMessage('gastei R$ 40,50 na padaria e recebi 1.250,75 do cliente');

assert.equal(result.drafts.length, 2);
assert.equal(result.drafts[0].amount, 40.5);
assert.equal(result.drafts[1].amount, 1250.75);
assert.equal(result.drafts[0].context, undefined);
assert.equal(result.drafts[1].context, 'Negocio');
assert.equal(parseCurrencyInput('40.50'), 40.5);
assert.equal(parseCurrencyInput('1.250,75'), 1250.75);
assert.equal(parseCurrencyInput('R$ 2,40'), 2.4);

const expense = {
  id: 'test-expense',
  title: 'Teste',
  amount: 100,
  type: 'expense',
  context: 'Pessoal',
  source: 'Manual',
  createdAt: new Date().toISOString(),
  account: 'Conta pessoal',
  walletAccountId: 'a1',
};
const afterExpense = applyMovementToAccounts(initialAccounts, expense);
const afterReversal = applyMovementToAccounts(afterExpense, expense, -1);

assert.equal(afterExpense.find((account) => account.id === 'a1')?.balance, 2380);
assert.equal(afterReversal.find((account) => account.id === 'a1')?.balance, 2480);

console.log('finance engine checks passed');
