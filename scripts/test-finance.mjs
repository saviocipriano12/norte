import assert from 'node:assert/strict';
import { applyMovementToAccounts, buildCashForecast, inferMovementCategory, inferOccurrenceDate, parseCurrencyInput, parseDraftCorrectionAmount, parseDraftCorrectionDate, parseFinanceMessage } from '../src/financeEngine.ts';
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
assert.equal(parseDraftCorrectionAmount('Nao, foi R$ 90, nao R$ 80.'), 90);
assert.equal(parseDraftCorrectionAmount('Pode colocar como despesa do negocio.'), null);
assert.equal(inferOccurrenceDate('gastei ontem', new Date('2026-08-11T12:00:00Z')), '2026-08-10');
assert.equal(inferOccurrenceDate('paguei na sexta', new Date('2026-08-11T12:00:00Z')), '2026-08-14');
assert.equal(parseDraftCorrectionDate('na verdade foi ontem', new Date('2026-08-11T12:00:00Z')), '2026-08-10');
assert.equal(inferMovementCategory('gastei no mercado', 'expense'), 'Alimentacao');
assert.equal(inferMovementCategory('recebi do cliente pelo projeto', 'income'), 'Servicos');

const forecast = buildCashForecast({
  today: '2026-08-11',
  startingBalance: 1000,
  dailyNet: 20,
  immediateOutflows: 100,
  datedOutflows: [{ due: '2026-08-14', amount: 1100 }],
  horizonDays: 5,
});
assert.equal(forecast.riskDate, '2026-08-14');
assert.equal(forecast.lowestBalance, -140);

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
