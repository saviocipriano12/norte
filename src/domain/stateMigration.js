const list = (value) => (Array.isArray(value) ? value : [])

const categoryLabel = (category) =>
  String(category || 'Geral')
    .replace('ServiÃƒÂ§o', 'Servico')
    .replace('ServiÃ§o', 'Servico')
    .replace('SalÃƒÂ¡rio', 'Salario')
    .replace('SalÃ¡rio', 'Salario')
    .replace('MovimentaÃƒÂ§ÃƒÂ£o', 'Movimentacao')
    .replace('MovimentaÃ§Ã£o', 'Movimentacao')
    .replace('AlimentaÃƒÂ§ÃƒÂ£o', 'Alimentacao')
    .replace('AlimentaÃ§Ã£o', 'Alimentacao')

const ledgerFor = (item, fallback = 'personal') => {
  const value = item?.ledger || item?.scope
  if (value === 'business') return 'business'
  if (value === 'personal') return 'personal'
  const name = String(item?.name || item?.title || '').toLowerCase()
  return /(pj|negocio|empresa|loja|cliente|fornecedor)/.test(name) ? 'business' : fallback
}

const dueDayFor = (card) => {
  const value = Number(card?.dueDay || card?.due)
  return Number.isFinite(value) ? Math.max(1, Math.min(31, value)) : 10
}

export function normalizeAppState(raw, defaults, currentDate) {
  if (!raw) return defaults

  const sourceAccounts = list(raw.accounts)
  const sourceEvents = list(raw.events).length ? list(raw.events) : list(raw.transactions)
  const sourceObligations = list(raw.obligations).length ? list(raw.obligations) : list(raw.bills)
  const normalizedAccounts = sourceAccounts.map((account, index) => ({
    ...account,
    id: account.id || `migrated-account-${index}`,
    ledger: ledgerFor(account),
    name: account.name || (ledgerFor(account) === 'business' ? 'Conta do negocio' : 'Conta pessoal'),
    kind: account.kind || account.type || 'bank',
    balance: Number(account.balance || account.currentBalance || 0),
    connected: Boolean(account.connected),
  }))
  const normalizedEvents = sourceEvents.map((event, index) => ({
    ...event,
    id: event.id || `migrated-event-${index}`,
    ledger: ledgerFor(event, event.type === 'income' ? 'business' : 'personal'),
    title: event.title || event.note || 'Movimento',
    type: event.type === 'income' ? 'income' : 'expense',
    amount: Number(event.amount || event.total || 0),
    category: categoryLabel(event.category),
    date: event.date || currentDate,
  }))
  const normalizedObligations = sourceObligations.map((item, index) => ({
    ...item,
    id: item.id || `migrated-obligation-${index}`,
    ledger: ledgerFor(item),
    title: item.title || item.note || 'Compromisso',
    type: item.type === 'receivable' ? 'receivable' : 'payable',
    amount: Number(item.amount || item.total || 0),
    due: item.due || item.date || currentDate,
    status: item.status === 'done' || item.status === 'paid' ? 'done' : 'open',
    category: categoryLabel(item.category || 'Agenda'),
  }))
  const normalizedCards = list(raw.cards).map((card, index) => ({
    ...card,
    id: card.id || `migrated-card-${index}`,
    ledger: ledgerFor(card),
    name: card.name || 'Cartao',
    limit: Number(card.limit || card.creditLimit || 0),
    used: Number(card.used || card.invoice || card.balance || 0),
    dueDay: dueDayFor(card),
    issuer: card.issuer || card.bankName || 'Norte',
    last4: String(card.last4 || card.numberLast4 || '0000').slice(-4),
    tone: card.tone || (ledgerFor(card) === 'business' ? 'electric' : 'aurora'),
  }))

  return {
    ...defaults,
    ...raw,
    person: { ...defaults.person, ...(raw.person || raw.user || {}) },
    ledgers: list(raw.ledgers).length ? list(raw.ledgers) : defaults.ledgers,
    accounts: normalizedAccounts.length ? normalizedAccounts : defaults.accounts,
    cards: normalizedCards.length ? normalizedCards : defaults.cards,
    plan: { ...defaults.plan, ...(raw.plan || {}) },
    connections: list(raw.connections),
    automations: list(raw.automations).length ? list(raw.automations) : defaults.automations,
    events: normalizedEvents,
    obligations: normalizedObligations,
    recurrences: list(raw.recurrences).length ? list(raw.recurrences) : defaults.recurrences,
    budgets: list(raw.budgets).length ? list(raw.budgets) : defaults.budgets,
    goals: list(raw.goals),
    assistant: list(raw.assistant).length ? list(raw.assistant) : defaults.assistant,
  }
}
