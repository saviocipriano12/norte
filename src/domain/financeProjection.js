const today = () => new Date().toISOString().slice(0, 10)

export const monthKey = (date = today()) => String(date || today()).slice(0, 7)

export function createMonthlyReport(events = [], moneyMap = [], currentDate = today()) {
  const currentMonth = monthKey(currentDate)
  const monthEvents = events.filter((event) => monthKey(event.date) === currentMonth)
  const income = monthEvents
    .filter((event) => event.type === 'income')
    .reduce((sum, event) => sum + Number(event.amount || 0), 0)
  const expense = monthEvents
    .filter((event) => event.type === 'expense')
    .reduce((sum, event) => sum + Number(event.amount || 0), 0)
  const personal = monthEvents
    .filter((event) => event.ledger !== 'business')
    .reduce((sum, event) => sum + (event.type === 'income' ? Number(event.amount || 0) : -Number(event.amount || 0)), 0)
  const business = monthEvents
    .filter((event) => event.ledger === 'business')
    .reduce((sum, event) => sum + (event.type === 'income' ? Number(event.amount || 0) : -Number(event.amount || 0)), 0)

  return {
    period: new Date(`${currentMonth}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' }),
    income,
    expense,
    net: income - expense,
    personal,
    business,
    topCategory: moneyMap[0] || null,
  }
}

export function buildCommitments({ upcoming = [], recurrences = [], installmentEvents = [], currentDate = today() }) {
  const datePrefix = String(currentDate || today()).slice(0, 8)
  return [
    ...upcoming.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      amount: Number(item.amount || 0),
      label: item.type === 'receivable' ? 'a receber' : 'a pagar',
      ledger: item.ledger,
      tone: item.type === 'receivable' ? 'income' : 'bill',
      date: item.due,
    })),
    ...recurrences.filter((item) => item.active).slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      amount: Number(item.amount || 0),
      label: item.type === 'receivable' ? `todo mes, dia ${item.day}` : `fixo dia ${item.day}`,
      ledger: item.ledger,
      tone: item.type === 'receivable' ? 'income' : 'fixed',
      date: `${datePrefix}${String(item.day).padStart(2, '0')}`,
    })),
    ...installmentEvents.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      amount: Number(item.installmentAmount || 0),
      label: `${item.installments} parcelas`,
      ledger: item.ledger,
      tone: 'installment',
      date: item.date,
    })),
  ].sort((a, b) => `${a.date}`.localeCompare(`${b.date}`)).slice(0, 8)
}

export function buildBudgetRhythm({ budgets = [], events = [], currentDate = today() }) {
  const currentMonth = monthKey(currentDate)
  const monthExpenses = events.filter((event) => monthKey(event.date) === currentMonth && event.type === 'expense')

  return budgets.map((budget) => {
    const used = monthExpenses
      .filter((event) => event.ledger === budget.ledger && event.category === budget.category)
      .reduce((sum, event) => sum + Number(event.amount || 0), 0)
    const limit = Number(budget.limit || 0)
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0
    const left = Math.max(0, limit - used)
    const tone = percent >= 100 ? 'danger' : percent >= 78 ? 'warning' : percent >= 48 ? 'attention' : 'safe'
    return {
      id: budget.id,
      ledger: budget.ledger,
      category: budget.category,
      label: budget.label || budget.category,
      limit,
      used,
      left,
      percent,
      tone,
    }
  }).sort((a, b) => b.percent - a.percent)
}

export function buildSmartAlerts({
  upcoming = [],
  safeToSpend = 0,
  monthlyCommitment = 0,
  cardDebt = 0,
  installmentMonthly = 0,
  report = {},
  moneyMap = [],
  budgetRhythm = [],
  currentDate = today(),
}) {
  const alerts = []
  const todayDate = String(currentDate || today()).slice(0, 10)
  const dueNow = upcoming.find((item) => item.status !== 'done' && String(item.due || '') <= todayDate)

  if (dueNow) {
    alerts.push({
      id: 'due-now',
      tone: 'danger',
      title: dueNow.type === 'receivable' ? 'Recebimento parado' : 'Conta vence agora',
      text: `${dueNow.title}: ${formatBrl(dueNow.amount)} ${dueNow.type === 'receivable' ? 'para confirmar' : 'para resolver'}.`,
      action: 'settle-first',
    })
  }

  if (monthlyCommitment > 0 && safeToSpend <= monthlyCommitment * 0.08) {
    alerts.push({
      id: 'low-safe',
      tone: 'warning',
      title: 'Livre apertado',
      text: `${formatBrl(safeToSpend)} livre contra ${formatBrl(monthlyCommitment)} reservado. Evite gasto novo sem falar comigo.`,
      action: 'command',
    })
  }

  if (cardDebt > 0) {
    alerts.push({
      id: 'card-debt',
      tone: 'violet',
      title: 'Fatura no radar',
      text: `${formatBrl(cardDebt)} em cartoes. Eu ja desconto isso antes de sugerir gasto.`,
      action: 'card',
    })
  }

  if (installmentMonthly > 0) {
    alerts.push({
      id: 'installments',
      tone: 'cyan',
      title: 'Parcelas ativas',
      text: `${formatBrl(installmentMonthly)} por mes em compras parceladas.`,
      action: 'command',
    })
  }

  if (Number(report.expense || 0) > Number(report.income || 0) && Number(report.expense || 0) > 0) {
    alerts.push({
      id: 'negative-month',
      tone: 'danger',
      title: 'Mes virou contra',
      text: `Saidas passaram entradas em ${formatBrl(Number(report.expense || 0) - Number(report.income || 0))}.`,
      action: 'command',
    })
  }

  const topCategory = moneyMap[0]
  if (topCategory?.percent >= 45) {
    alerts.push({
      id: 'category-weight',
      tone: 'pink',
      title: `${topCategory.label} pesou`,
      text: `${topCategory.percent}% das saidas mapeadas estao aqui.`,
      action: 'command',
    })
  }

  const tightBudget = budgetRhythm.find((item) => item.percent >= 90)
  if (tightBudget) {
    alerts.push({
      id: `budget-${tightBudget.id}`,
      tone: tightBudget.percent >= 100 ? 'danger' : 'warning',
      title: `${tightBudget.label} no limite`,
      text: `${tightBudget.percent}% usado. Restam ${formatBrl(tightBudget.left)} nesse ritmo.`,
      action: 'command',
    })
  }

  return dedupeAlerts(alerts).slice(0, 4)
}

const formatBrl = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))

const dedupeAlerts = (alerts) => {
  const seen = new Set()
  return alerts.filter((alert) => {
    if (seen.has(alert.id)) return false
    seen.add(alert.id)
    return true
  })
}
