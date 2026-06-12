import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Brain,
  CalendarClock,
  Check,
  ChevronRight,
  Compass,
  CreditCard,
  Fingerprint,
  Landmark,
  LockKeyhole,
  LogOut,
  Mic,
  Moon,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Volume2,
  VolumeX,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'
import './App.css'
import './theme.css'
import {
  firebaseEnabled,
  loadFirebaseState,
  loginWithEmail,
  logoutFirebase,
  registerWithEmail,
  resetFirebasePassword,
  saveFirebaseState,
  watchAuth,
} from './firebaseClient'
import { parseEntryOperation } from './domain/entryParser'
import { buildBudgetRhythm, buildCommitments, buildSmartAlerts, createMonthlyReport } from './domain/financeProjection'
import { normalizeAppState } from './domain/stateMigration'

const today = () => new Date().toISOString().slice(0, 10)

const addDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

const brl = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))

const parseMoney = (value) => Number(String(value || '').replace(/\./g, '').replace(',', '.') || 0)

const draftCategories = ['Mercado', 'Vendas', 'Operacao', 'Pix', 'Conta fixa', 'Transporte', 'Alimentacao', 'Geral']

const extractAmountFromText = (value) => {
  const match = String(value || '').replace(/\./g, '').replace(',', '.').match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : 0
}

const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

const defaultState = {
  product: 'norte-zero',
  onboarded: false,
  plan: {
    id: 'start',
    tier: 'Norte Start',
    status: 'trial',
    trialDays: 14,
  },
  person: {
    name: '',
    workName: '',
    mode: 'hybrid',
    profile: 'mei',
    pain: 'mixing',
  },
  ledgers: [
    { id: 'personal', name: 'Pessoal', accent: 'violet', intent: 'vida, casa, desejos e seguranca' },
    { id: 'business', name: 'Negocio', accent: 'cyan', intent: 'vendas, clientes, custos e crescimento' },
  ],
  accounts: [
    { id: 'norte-main', ledger: 'personal', name: 'Carteira pessoal', kind: 'wallet', balance: 0, connected: false },
    { id: 'norte-business', ledger: 'business', name: 'Conta do negocio', kind: 'bank', balance: 0, connected: false },
  ],
  cards: [
    { id: 'aura', ledger: 'personal', name: 'Norte pessoal', issuer: 'Norte', last4: '7216', limit: 2500, used: 0, dueDay: 12, tone: 'graphite' },
    { id: 'studio', ledger: 'business', name: 'Norte negocio', issuer: 'Norte', last4: '4364', limit: 4000, used: 0, dueDay: 20, tone: 'violet' },
  ],
  connections: [],
  automations: [
    { id: 'rule-client', keyword: 'cliente', ledger: 'business', category: 'Vendas', enabled: true },
    { id: 'rule-market', keyword: 'mercado', ledger: 'personal', category: 'Mercado', enabled: true },
    { id: 'rule-supplier', keyword: 'fornecedor', ledger: 'business', category: 'Operacao', enabled: true },
    { id: 'rule-bill', keyword: 'boleto', ledger: 'personal', category: 'Conta fixa', enabled: true },
  ],
  events: [],
  obligations: [],
  recurrences: [
    { id: 'rec-internet', title: 'Internet', ledger: 'personal', type: 'payable', amount: 120, day: 10, category: 'Conta fixa', active: true },
    { id: 'rec-tools', title: 'Ferramentas do negocio', ledger: 'business', type: 'payable', amount: 89, day: 15, category: 'Operacao', active: true },
  ],
  budgets: [
    { id: 'budget-market', ledger: 'personal', category: 'Mercado', label: 'Mercado', limit: 900 },
    { id: 'budget-food', ledger: 'personal', category: 'Alimentacao', label: 'Comida fora', limit: 520 },
    { id: 'budget-transport', ledger: 'personal', category: 'Transporte', label: 'Transporte', limit: 420 },
    { id: 'budget-operation', ledger: 'business', category: 'Operacao', label: 'Operacao', limit: 1200 },
    { id: 'budget-marketing', ledger: 'business', category: 'Marketing', label: 'Marketing', limit: 950 },
  ],
  goals: [],
  assistant: [
    {
      id: 'hello',
      role: 'norte',
      text: 'Eu sou o Norte. Me diga o que aconteceu com seu dinheiro e eu separo pessoal e negocio para voce.',
      at: new Date().toISOString(),
    },
  ],
}

const availableBanks = [
  { id: 'nubank', name: 'Nubank', ledger: 'personal', balance: 1840, tone: 'aurora' },
  { id: 'itau', name: 'Itau', ledger: 'personal', balance: 920, tone: 'pulse' },
  { id: 'inter-pj', name: 'Inter PJ', ledger: 'business', balance: 3100, tone: 'electric' },
  { id: 'cora', name: 'Cora PJ', ledger: 'business', balance: 2250, tone: 'electric' },
]

const plans = [
  {
    id: 'start',
    name: 'Norte Start',
    price: 19,
    billing: '/mes',
    text: 'controle pessoal + negocio com IA para vencer a preguica de anotar',
    headline: 'Para organizar a vida financeira sem virar planilha.',
    badge: 'comece aqui',
    cta: 'Assinar Start',
    limits: { accounts: 3, cards: 2, automations: 5, recurrences: 8, ai: 150 },
    features: ['IA por texto e voz', 'bussola financeira', 'pessoal e negocio separados', 'alertas essenciais'],
  },
  {
    id: 'pro',
    name: 'Norte Pro',
    price: 39,
    billing: '/mes',
    text: 'carteira completa, Open Finance futuro, metas, recorrencias e relatorios',
    headline: 'Para quem quer enxergar tudo antes do dinheiro escapar.',
    badge: 'mais desejado',
    cta: 'Assinar Pro',
    limits: { accounts: 8, cards: 6, automations: 15, recurrences: 25, ai: 600 },
    features: ['carteira com varias contas', 'cartoes e parcelas', 'relatorios por periodo', 'preparado para Open Finance'],
  },
  {
    id: 'business',
    name: 'Norte Business',
    price: 79,
    billing: '/mes',
    text: 'gestao forte para MEI, freelancer e pequeno negocio crescer com clareza',
    headline: 'Para transformar bagunca financeira em operacao.',
    badge: 'negocio',
    cta: 'Assinar Business',
    limits: { accounts: 'unlimited', cards: 'unlimited', automations: 'unlimited', recurrences: 'unlimited', ai: 2000 },
    features: ['fluxo de caixa do negocio', 'clientes e fornecedores futuros', 'estoque leve futuro', 'memoria segura da IA'],
  },
]

const planFormat = (value) => (value === 'unlimited' ? 'ilimitado' : value)

const getActivePlan = (plan) => plans.find((item) => item.id === plan?.id || item.name === plan?.tier) || plans[0]

function getPlanUsage(state) {
  return {
    accounts: state.accounts.length,
    cards: state.cards.length,
    automations: state.automations.length,
    recurrences: state.recurrences.length,
    ai: state.assistant.filter((message) => message.role === 'user').length,
  }
}

function getPlanUsageRows(state) {
  const activePlan = getActivePlan(state.plan)
  const usage = getPlanUsage(state)
  return [
    { id: 'accounts', label: 'Contas e carteiras', used: usage.accounts, limit: activePlan.limits.accounts },
    { id: 'cards', label: 'Cartoes ativos', used: usage.cards, limit: activePlan.limits.cards },
    { id: 'automations', label: 'Regras da IA', used: usage.automations, limit: activePlan.limits.automations },
    { id: 'recurrences', label: 'Fixos e recorrencias', used: usage.recurrences, limit: activePlan.limits.recurrences },
    { id: 'ai', label: 'Conversas com IA no mes', used: usage.ai, limit: activePlan.limits.ai },
  ]
}

function createDemoState() {
  return normalizeState({
    ...defaultState,
    onboarded: true,
    person: {
      name: 'Savio',
      workName: 'Agencia Norte',
      mode: 'hybrid',
    },
    accounts: [
      { id: 'demo-personal', ledger: 'personal', name: 'Carteira pessoal', kind: 'wallet', balance: 2280, connected: false },
      { id: 'demo-business', ledger: 'business', name: 'Conta do negocio', kind: 'bank', balance: 6840, connected: false },
      { id: 'demo-open-nubank', ledger: 'personal', name: 'Nubank', kind: 'bank', balance: 1840, connected: true },
      { id: 'demo-open-cora', ledger: 'business', name: 'Cora PJ', kind: 'bank', balance: 3920, connected: true },
    ],
    cards: [
      { id: 'aura', ledger: 'personal', name: 'Nubank Ultravioleta', issuer: 'Nubank', last4: '4364', limit: 3800, used: 640, dueDay: 12, tone: 'nubank' },
      { id: 'studio', ledger: 'business', name: 'Cora Pro', issuer: 'Cora', last4: '7216', limit: 8000, used: 1180, dueDay: 20, tone: 'cora' },
    ],
    connections: [
      { id: 'nubank', name: 'Nubank', ledger: 'personal', balance: 1840, tone: 'aurora', status: 'ready', lastSync: new Date().toISOString() },
      { id: 'cora', name: 'Cora PJ', ledger: 'business', balance: 3920, tone: 'electric', status: 'ready', lastSync: new Date().toISOString() },
    ],
    events: [
      { id: 'demo-sale', title: 'Projeto social media cliente', ledger: 'business', type: 'income', amount: 2400, category: 'Vendas', date: today() },
      { id: 'demo-market', title: 'Mercado da semana', ledger: 'personal', type: 'expense', amount: 320, category: 'Mercado', date: today() },
      { id: 'demo-ads', title: 'Trafego pago campanha', ledger: 'business', type: 'expense', amount: 450, category: 'Marketing', date: today() },
      { id: 'demo-installment', title: 'Camera para conteudo', ledger: 'business', type: 'expense', amount: 1800, category: 'Equipamento', date: today(), cardId: 'studio', installments: 6, installmentAmount: 300 },
    ],
    obligations: [
      { id: 'demo-bill', title: 'Fornecedor design', ledger: 'business', type: 'payable', amount: 680, due: today(), status: 'open', category: 'Operacao' },
      { id: 'demo-receive', title: 'Cliente recorrente', ledger: 'business', type: 'receivable', amount: 1200, due: today(), status: 'open', category: 'Vendas' },
    ],
    goals: [
      { id: 'demo-reserve', title: 'Reserva segura', target: 10000, current: 2800 },
      { id: 'demo-equipment', title: 'Notebook novo', target: 6500, current: 1700 },
    ],
    assistant: [
      {
        id: 'demo-ai',
        role: 'norte',
        text: 'Demo pronta. Pergunte quanto pode gastar, para onde o dinheiro vai ou registre uma venda por voz.',
        at: new Date().toISOString(),
      },
      ...defaultState.assistant,
    ],
  })
}

function normalizeState(raw) {
  return normalizeAppState(raw, defaultState, today())
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

function useNorteStore(forceDemo = false) {
  const [state, setState] = useState(() => (forceDemo ? createDemoState() : null))
  const [sync, setSync] = useState(forceDemo ? 'demo' : 'loading')
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(!firebaseEnabled || forceDemo)

  useEffect(() => {
    if (forceDemo || !firebaseEnabled) return undefined
    return watchAuth((user) => {
      setAuthUser(user)
      setAuthReady(true)
      if (!user) setState(null)
    })
  }, [forceDemo])

  useEffect(() => {
    if (firebaseEnabled && (!authReady || !authUser)) return undefined
    let alive = true
    const loader = firebaseEnabled ? loadFirebaseState(authUser.uid).then((data) => ({ data })) : fetchJson('/api/state')
    loader
      .then((payload) => {
        if (!alive) return
        setState(normalizeState(payload.data))
        setSync('ready')
      })
      .catch(() => {
        if (!alive) return
        setState(defaultState)
        setSync('offline')
      })
    return () => {
      alive = false
    }
  }, [authReady, authUser, forceDemo])

  useEffect(() => {
    if (!state || sync === 'loading' || forceDemo) return undefined
    const timeout = window.setTimeout(() => {
      const saver = firebaseEnabled && authUser
        ? saveFirebaseState(authUser.uid, state)
        : fetchJson('/api/state', { method: 'PUT', body: JSON.stringify({ data: state }) })
      Promise.resolve(saver)
        .then(() => setSync('ready'))
        .catch(() => setSync('offline'))
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [state, sync, authUser, forceDemo])

  return { state, setState, sync, setSync, authUser, authReady }
}

function derive(state) {
  const byLedger = Object.fromEntries(state.ledgers.map((ledger) => [ledger.id, { income: 0, expense: 0, balance: 0 }]))
  state.accounts.forEach((account) => {
    const bucket = byLedger[account.ledger] || byLedger.personal || Object.values(byLedger)[0]
    if (bucket) bucket.balance += Number(account.balance || 0)
  })
  state.events.forEach((event) => {
    const bucket = byLedger[event.ledger] || byLedger.personal
    if (event.type === 'income') bucket.income += Number(event.amount || 0)
    if (event.type === 'expense') bucket.expense += Number(event.amount || 0)
  })
  Object.values(byLedger).forEach((bucket) => {
    bucket.balance += bucket.income - bucket.expense
  })
  const totalBalance = Object.values(byLedger).reduce((sum, item) => sum + item.balance, 0)
  const upcoming = state.obligations.filter((item) => item.status !== 'done').sort((a, b) => `${a.due}`.localeCompare(`${b.due}`))
  const payable = upcoming.filter((item) => item.type === 'payable').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const receivable = upcoming.filter((item) => item.type === 'receivable').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const recurringPayable = state.recurrences
    .filter((item) => item.active && item.type === 'payable')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const recurringReceivable = state.recurrences
    .filter((item) => item.active && item.type === 'receivable')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const cardDebt = state.cards.reduce((sum, card) => sum + Number(card.used || 0), 0)
  const installmentEvents = state.events.filter((event) => event.type === 'expense' && Number(event.installments || 1) > 1)
  const installmentMonthly = installmentEvents.reduce((sum, event) => sum + Number(event.installmentAmount || 0), 0)
  const connectedBalance = state.connections.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  const eventDays = new Set(state.events.map((event) => event.date)).size
  const monthlyCommitment = payable + recurringPayable + installmentMonthly + cardDebt
  const safeToSpend = Math.max(0, totalBalance + receivable + recurringReceivable - monthlyCommitment)
  const categoryMap = new Map()
  const addCategory = (label, amount, ledger = 'personal') => {
    const key = label || 'Geral'
    const current = categoryMap.get(key) || { label: key, amount: 0, personal: 0, business: 0 }
    current.amount += Number(amount || 0)
    current[ledger === 'business' ? 'business' : 'personal'] += Number(amount || 0)
    categoryMap.set(key, current)
  }
  state.events
    .filter((event) => event.type === 'expense')
    .forEach((event) => addCategory(event.category || 'Geral', event.installments > 1 ? event.installmentAmount : event.amount, event.ledger))
  state.recurrences
    .filter((item) => item.active && item.type === 'payable')
    .forEach((item) => addCategory(item.category || 'Fixo mensal', item.amount, item.ledger))
  if (cardDebt) addCategory('Cartoes', cardDebt, 'personal')
  const categoryTotal = [...categoryMap.values()].reduce((sum, item) => sum + item.amount, 0)
  const moneyMap = [...categoryMap.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item) => ({ ...item, percent: categoryTotal ? Math.round((item.amount / categoryTotal) * 100) : 0 }))
  const personalOutflow = moneyMap.reduce((sum, item) => sum + item.personal, 0)
  const businessOutflow = moneyMap.reduce((sum, item) => sum + item.business, 0)
  const report = createMonthlyReport(state.events, moneyMap, today())
  const budgetRhythm = buildBudgetRhythm({
    budgets: state.budgets,
    events: state.events,
    currentDate: today(),
  })
  const score = Math.max(
    4,
    Math.min(
      100,
      Math.round(
        (totalBalance > 0 ? 24 : 8) +
          (payable ? Math.min(22, (receivable / Math.max(payable, 1)) * 22) : 22) +
          Math.min(20, eventDays * 4) +
          Math.min(16, state.goals.length * 5 + 6) +
          Math.max(0, 18 - upcoming.filter((item) => item.due < today()).length * 8),
      ),
    ),
  )
  const forecast = [
    { label: 'agora', value: totalBalance },
    { label: 'contas', value: totalBalance - payable - recurringPayable },
    { label: 'parcelas', value: totalBalance - payable - recurringPayable - installmentMonthly },
    { label: 'previsto', value: totalBalance - monthlyCommitment + receivable + recurringReceivable },
  ]
  const commitments = buildCommitments({
    upcoming,
    recurrences: state.recurrences,
    installmentEvents,
    currentDate: today(),
  })
  const alerts = buildSmartAlerts({
    upcoming,
    safeToSpend,
    monthlyCommitment,
    cardDebt,
    installmentMonthly,
    report,
    moneyMap,
    budgetRhythm,
    currentDate: today(),
  })
  const nextActions = [
    upcoming[0] && {
      id: 'settle',
      tone: 'urgent',
      title: upcoming[0].type === 'receivable' ? 'Confirmar recebimento' : 'Resolver conta',
      text: `${upcoming[0].title} - ${brl(upcoming[0].amount)} vence ${dateLabel(upcoming[0].due)}`,
      action: 'settle-first',
    },
    !state.connections.length && {
      id: 'connect',
      tone: 'cyan',
      title: 'Conectar sua vida financeira',
      text: 'Junte bancos pessoais e do negocio em uma carteira so.',
      action: 'connect',
    },
    state.recurrences.length < 3 && {
      id: 'recurrence',
      tone: 'cyan',
      title: 'Mapear gasto fixo',
      text: 'Cadastre recorrencias para o Norte prever antes de voce lembrar.',
      action: 'recurrence',
    },
    cardDebt > 0 && {
      id: 'card',
      tone: 'violet',
      title: 'Fatura no radar',
      text: `${brl(cardDebt)} em cartoes antes de calcular seu livre real.`,
      action: 'card',
    },
    !state.goals.length && {
      id: 'goal',
      tone: 'gold',
      title: 'Criar primeira meta',
      text: 'Separe dinheiro de objetivo antes que vire gasto comum.',
      action: 'goal',
    },
    {
      id: 'talk',
      tone: 'pink',
      title: 'Falar com o Norte',
      text: safeToSpend ? `${brl(safeToSpend)} livre hoje. Pergunte o que fazer.` : 'Monte sua rota com uma conversa rapida.',
      action: 'command',
    },
  ].filter(Boolean).slice(0, 3)
  return {
    byLedger,
    totalBalance,
    connectedBalance,
    upcoming,
    payable,
    receivable,
    recurringPayable,
    recurringReceivable,
    cardDebt,
    installmentMonthly,
    monthlyCommitment,
    commitments,
    alerts,
    moneyMap,
    outflowTotal: categoryTotal,
    personalOutflow,
    businessOutflow,
    report,
    budgetRhythm,
    safeToSpend,
    forecast,
    nextActions,
    score,
    status: score > 80 ? 'apontando para o norte' : score > 58 ? 'quase no eixo' : score > 34 ? 'fora da rota' : 'modo resgate',
    insights: [
      {
        id: 'spend',
        icon: Activity,
        label: 'Livre hoje',
        value: brl(safeToSpend),
        text: monthlyCommitment ? `${brl(monthlyCommitment)} reservado` : 'sem contas abertas agora',
      },
      {
        id: 'income',
        icon: ArrowDownRight,
        label: 'A receber',
        value: brl(receivable),
        text: receivable ? 'dinheiro futuro ja previsto' : 'nenhum recebimento previsto',
      },
      {
        id: 'risk',
        icon: BellRing,
        label: 'Proximo alerta',
        value: upcoming[0] ? dateLabel(upcoming[0].due) : cardDebt ? brl(cardDebt) : 'limpo',
        text: upcoming[0]?.title || (cardDebt ? 'em faturas abertas' : 'sem vencimentos na fila'),
      },
    ],
  }
}

function classifyText(text) {
  const lower = text.toLowerCase()
  const amount = extractAmountFromText(lower)
  const businessWords = ['cliente', 'vendi', 'venda', 'negocio', 'fornecedor', 'material', 'servico', 'pix da loja', 'estoque']
  const incomeWords = ['recebi', 'ganhei', 'entrou', 'vendi', 'pagou', 'venda']
  const billWords = ['pagar', 'vence', 'vencimento', 'boleto', 'conta']
  const category = lower.includes('mercado')
    ? 'Mercado'
    : lower.includes('cliente') || lower.includes('vendi') || lower.includes('venda')
      ? 'Vendas'
      : lower.includes('material') || lower.includes('fornecedor')
        ? 'Operacao'
        : lower.includes('pix')
          ? 'Pix'
          : 'Geral'
  return {
    id: uid(),
    kind: billWords.some((word) => lower.includes(word)) ? 'obligation' : 'event',
    ledger: businessWords.some((word) => lower.includes(word)) ? 'business' : 'personal',
    type: incomeWords.some((word) => lower.includes(word)) ? 'income' : 'expense',
    amount,
    category,
    title: text.slice(0, 80),
    date: today(),
    due: today(),
    confidence: amount ? 0.82 : 0.46,
  }
}

function looksLikeFinancialInput(text) {
  const lower = text.toLowerCase()
  const words = [
    'paguei',
    'gastei',
    'comprei',
    'recebi',
    'vendi',
    'ganhei',
    'entrou',
    'pix',
    'boleto',
    'cartao',
    'conta',
    'cliente',
    'mercado',
    'fornecedor',
    'material',
    'salario',
    'aluguel',
    'internet',
  ]
  return words.some((word) => lower.includes(word)) || extractAmountFromText(text) > 0
}

function inferDateFromText(text) {
  const lower = text.toLowerCase()
  if (lower.includes('amanha')) return addDays(1)
  if (lower.includes('hoje')) return today()
  if (lower.includes('semana que vem') || lower.includes('semana')) return addDays(7)
  const dayMatch = lower.match(/dia\s+(\d{1,2})/)
  if (!dayMatch) return null
  const date = new Date()
  date.setDate(Number(dayMatch[1]))
  if (date < new Date(today())) date.setMonth(date.getMonth() + 1)
  return date.toISOString().slice(0, 10)
}

function isFutureBill(text) {
  const lower = text.toLowerCase()
  return ['pagar', 'vence', 'vencimento', 'boleto', 'conta'].some((word) => lower.includes(word))
}

function normalizeCategoryLabel(category) {
  const clean = String(category || 'Geral')
  return clean
    .replace('ServiÃ§o', 'Servico')
    .replace('SalÃ¡rio', 'Salario')
    .replace('MovimentaÃ§Ã£o', 'Movimentacao')
    .replace('AlimentaÃ§Ã£o', 'Alimentacao')
}

function draftFromParsed(item) {
  const bill = isFutureBill(item.note || item.title)
  return {
    id: item.id || uid(),
    kind: bill ? 'obligation' : 'event',
    ledger: item.scope === 'business' ? 'business' : 'personal',
    type: item.type === 'income' ? 'income' : 'expense',
    amount: Number(item.amount || 0),
    category: normalizeCategoryLabel(item.category),
    title: item.note || item.title || 'Movimento',
    date: item.date || today(),
    due: item.date || today(),
    confidence: 0.86,
  }
}

function applyAutomation(draft, state) {
  const text = `${draft.title} ${draft.category}`.toLowerCase()
  const rule = state.automations?.find((item) => item.enabled && text.includes(String(item.keyword || '').toLowerCase()))
  if (!rule) return draft
  return {
    ...draft,
    ledger: rule.ledger,
    category: rule.category,
    automationId: rule.id,
    confidence: Math.max(Number(draft.confidence || 0), 0.92),
  }
}

function draftReason(draft) {
  if (draft.automationId) return 'Usei uma regra do Autopiloto para separar melhor.'
  if (draft.ledger === 'business' && draft.type === 'income') return 'Entrada com cara de cliente ou trabalho vai para o negocio.'
  if (draft.ledger === 'business') return 'Termos de operacao, fornecedor ou projeto indicam negocio.'
  if (draft.category === 'Mercado' || draft.category === 'Conta fixa') return 'Despesa do dia a dia ficou no pessoal.'
  return 'Separei pelo contexto da frase e deixei para voce confirmar.'
}

function draftImpact(draft, finance) {
  const amount = Number(draft.amount || 0)
  if (draft.kind === 'obligation') return `${draft.type === 'income' ? 'entra na agenda a receber' : 'vira compromisso futuro'} em ${dateLabel(draft.due || today())}.`
  if (draft.type === 'income') return `aumenta a carteira ${draft.ledger === 'business' ? 'do negocio' : 'pessoal'} em ${brl(amount)}.`
  const after = finance ? brl(Math.max(0, Number(finance.safeToSpend || 0) - amount)) : brl(amount)
  return `reduz o dinheiro livre estimado para perto de ${after}.`
}

function suggestBudgetLimit(item) {
  const used = Number(item?.used || 0)
  const limit = Number(item?.limit || 0)
  const base = Math.max(500, limit, used * 1.15)
  return Math.ceil(base / 50) * 50
}

function nextCardDueDate(card, currentDate = today()) {
  const date = new Date(`${currentDate}T12:00:00`)
  const due = new Date(date)
  due.setDate(Math.max(1, Math.min(31, Number(card?.dueDay || 1))))
  if (due < date) due.setMonth(due.getMonth() + 1)
  return due.toISOString().slice(0, 10)
}

function getCardHealth(card, currentDate = today()) {
  const limit = Number(card?.limit || 0)
  const used = Number(card?.used || 0)
  const free = Math.max(0, limit - used)
  const usedPercent = limit > 0 ? Math.min(999, Math.round((used / limit) * 100)) : 0
  const due = nextCardDueDate(card, currentDate)
  const daysToDue = Math.max(0, Math.ceil((new Date(`${due}T12:00:00`) - new Date(`${currentDate}T12:00:00`)) / 86400000))
  const tone = usedPercent >= 90 ? 'danger' : usedPercent >= 70 || daysToDue <= 3 ? 'warning' : 'safe'
  return {
    limit,
    used,
    free,
    usedPercent,
    due,
    daysToDue,
    tone,
  }
}

function parseSmartDrafts(text, state) {
  const parsed = parseEntryOperation({
    text,
    data: state,
    defaultScope: 'personal',
    source: 'norte-zero',
  }).map((item) => applyAutomation(draftFromParsed(item), state))

  if (parsed.length) return parsed
  const fallback = applyAutomation(classifyText(text), state)
  return fallback.amount ? [fallback] : []
}

function answerQuestion(text, state, finance) {
  const lower = text.toLowerCase()
  if (['quanto posso gastar', 'posso gastar', 'livre'].some((phrase) => lower.includes(phrase))) {
    return `Voce tem ${brl(finance.safeToSpend)} livre agora. Eu preservei ${brl(finance.payable)} para contas e considerei ${brl(finance.receivable)} a receber.`
  }
  if (['como estou', 'minha rota', 'bussola', 'norte'].some((phrase) => lower.includes(phrase))) {
    return `Sua bussola esta em ${finance.score}%: ${finance.status}. O melhor proximo passo e registrar os movimentos de hoje e quitar o que vencer primeiro.`
  }
  if (['contas', 'vencendo', 'pagar'].some((phrase) => lower.includes(phrase))) {
    const next = finance.upcoming[0]
    return next
      ? `A proxima conta e ${next.title}, ${brl(next.amount)}, vencendo em ${dateLabel(next.due)}.`
      : 'Nao encontrei contas abertas. Se voce tiver boleto ou recebimento futuro, me diga que eu coloco na agenda.'
  }
  if (['para onde', 'onde meu dinheiro', 'gastei mais', 'categorias'].some((phrase) => lower.includes(phrase))) {
    const top = finance.moneyMap[0]
    return top
      ? `Seu maior peso agora e ${top.label}: ${brl(top.amount)}, cerca de ${top.percent}% das saidas mapeadas. Pessoal soma ${brl(finance.personalOutflow)} e negocio soma ${brl(finance.businessOutflow)}.`
      : 'Ainda nao tenho saidas suficientes para mapear. Registre alguns gastos ou fixos e eu mostro o caminho do dinheiro.'
  }
  if (['plano', 'assinatura', 'preco'].some((phrase) => lower.includes(phrase))) {
    return `Voce esta no ${state.plan.tier}. A evolucao natural e o Norte Pro para Open Finance, recorrencias e alertas inteligentes.`
  }
  if (['autopiloto', 'regras', 'automatico'].some((phrase) => lower.includes(phrase))) {
    return `Seu Autopiloto tem ${state.automations.length} regras ativas para separar pessoal e negocio antes de salvar. Posso usar isso para reduzir sua preguiça de anotar.`
  }
  return null
}

function UnderstandingRail({ state, drafts, pendingDraft, command }) {
  const lastUserMessage = state.assistant.find((message) => message.role === 'user')?.text
  const activeDraft = drafts[0] || pendingDraft
  const sourceText = command.trim() || lastUserMessage || 'Toque no microfone e fale como voce falaria comigo.'
  const understood = activeDraft
    ? [
        activeDraft.ledger === 'business' ? 'Negocio' : 'Pessoal',
        activeDraft.type === 'income' ? 'Entrada' : 'Saida',
        activeDraft.category,
        activeDraft.amount ? brl(activeDraft.amount) : 'valor aberto',
      ]
    : ['separacao automatica', 'confirmacao antes de salvar', 'memoria segura']

  return (
    <section className="understanding-rail">
      <article>
        <span>1</span>
        <div>
          <small>voce falou</small>
          <strong>{sourceText}</strong>
        </div>
      </article>
      <article>
        <span>2</span>
        <div>
          <small>eu entendi</small>
          <strong>{understood.join(' - ')}</strong>
        </div>
      </article>
      <article>
        <span>3</span>
        <div>
          <small>proximo passo</small>
          <strong>{drafts.length ? 'confirmar ou ajustar' : pendingDraft ? 'responder o detalhe' : 'falar ou escrever'}</strong>
        </div>
      </article>
    </section>
  )
}

function App() {
  const [demoMode, setDemoMode] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1')
  const { state, setState, sync, setSync, authUser, authReady } = useNorteStore(demoMode)
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).get('mode') === 'command' ? 'command' : 'home'))
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem('norte-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [sheet, setSheet] = useState(null)
  const [command, setCommand] = useState('')
  const [drafts, setDrafts] = useState([])
  const [pendingDraft, setPendingDraft] = useState(null)
  const [listening, setListening] = useState(false)
  const [aiState, setAiState] = useState('idle')
  const [lastSaved, setLastSaved] = useState(null)
  const [dockCompact, setDockCompact] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const recognitionRef = useRef(null)

  const finance = useMemo(() => (state ? derive(state) : null), [state])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('norte-theme', theme)
  }, [theme])

  useEffect(() => {
    let ticking = false
    const updateDock = () => {
      setDockCompact(window.scrollY > 220)
      ticking = false
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(updateDock)
    }
    updateDock()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function startDemo() {
    setState(createDemoState())
    setSync('demo')
    setDemoMode(true)
    window.history.replaceState(null, '', '?demo=1')
  }

  function speak(text) {
    if (!voiceEnabled || !window.speechSynthesis || !text) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'pt-BR'
    utterance.rate = 1
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }

  if (firebaseEnabled && authReady && !authUser && !demoMode) return <Auth onDemo={startDemo} />

  if (!state || !finance) {
    return (
      <main className="zero-boot">
        <div className="zero-orb"><Compass /></div>
        <strong>Norte</strong>
        <span>criando sua experiencia financeira</span>
      </main>
    )
  }

  if (!state.onboarded) return <Onboarding onDone={(next) => setState(next)} />

  const mutate = (fn) => setState((current) => normalizeState(fn(normalizeState(current))))

  function addEvent(payload) {
    mutate((current) => ({
      ...current,
      events: [{ id: uid(), date: today(), ...payload }, ...current.events],
    }))
  }

  function addObligation(payload) {
    mutate((current) => ({
      ...current,
      obligations: [{ id: uid(), due: today(), status: 'open', ...payload }, ...current.obligations],
    }))
  }

  function settleObligation(obligationId) {
    mutate((current) => {
      const obligation = current.obligations.find((item) => item.id === obligationId)
      if (!obligation) return current
      const event = {
        id: uid(),
        title: obligation.title,
        ledger: obligation.ledger,
        type: obligation.type === 'receivable' ? 'income' : 'expense',
        amount: obligation.amount,
        category: obligation.category || 'Agenda',
        date: today(),
      }
      return {
        ...current,
        events: [event, ...current.events],
        obligations: current.obligations.map((item) => (item.id === obligationId ? { ...item, status: 'done' } : item)),
        assistant: [
          {
            id: uid(),
            role: 'norte',
            text: `${obligation.type === 'receivable' ? 'Recebimento' : 'Pagamento'} baixado. Eu ja levei isso para o feed e recalculei sua rota.`,
            at: new Date().toISOString(),
          },
          ...current.assistant,
        ],
      }
    })
  }

  function handleCommand(text = command) {
    if (!text.trim()) return
    setAiState('thinking')
    const lower = text.toLowerCase()
    const answer = answerQuestion(text, state, finance)
    if (answer) {
      setDrafts([])
      setPendingDraft(null)
      setAiState('ready')
      speak(answer)
      mutate((current) => ({
        ...current,
        assistant: [
          { id: uid(), role: 'user', text, at: new Date().toISOString() },
          { id: uid(), role: 'norte', text: answer, at: new Date().toISOString() },
          ...current.assistant,
        ],
      }))
      setCommand('')
      return
    }

    if (pendingDraft && ['cancela', 'cancelar', 'deixa', 'esquece'].some((word) => lower.includes(word))) {
      const reply = 'Fechado, descartei esse rascunho. Quando quiser, me fala de novo do seu jeito.'
      setPendingDraft(null)
      setDrafts([])
      setAiState('idle')
      speak(reply)
      mutate((current) => ({
        ...current,
        assistant: [
          { id: uid(), role: 'user', text, at: new Date().toISOString() },
          { id: uid(), role: 'norte', text: reply, at: new Date().toISOString() },
          ...current.assistant,
        ],
      }))
      setCommand('')
      return
    }

    const pendingAmount = extractAmountFromText(text)
    if (pendingDraft && pendingAmount) {
      const inferredDate = inferDateFromText(text)
      const completed = applyAutomation(
        {
          ...pendingDraft,
          id: uid(),
          amount: pendingAmount,
          ...(inferredDate ? { date: inferredDate, due: inferredDate } : {}),
          confidence: 0.9,
        },
        state,
      )
      const reply = `Perfeito. Montei ${completed.ledger === 'business' ? 'no negocio' : 'no pessoal'}: ${completed.title}, ${brl(completed.amount)} em ${completed.category}${completed.kind === 'obligation' ? ` para ${dateLabel(completed.due)}` : ''}. Ajuste se precisar e confirme antes de salvar.`
      setPendingDraft(null)
      setDrafts([completed])
      setAiState('ready')
      speak(reply)
      mutate((current) => ({
        ...current,
        assistant: [
          { id: uid(), role: 'user', text, at: new Date().toISOString() },
          { id: uid(), role: 'norte', text: reply, at: new Date().toISOString() },
          ...current.assistant,
        ],
      }))
      setCommand('')
      return
    }

    const inferredDate = inferDateFromText(text)
    const nextDrafts = parseSmartDrafts(text, state).map((draft) => (
      inferredDate ? { ...draft, date: inferredDate, due: inferredDate } : draft
    ))
    setDrafts(nextDrafts)
    const total = nextDrafts.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const needsAmount = !nextDrafts.length && looksLikeFinancialInput(text)
    const incompleteDraft = needsAmount
      ? applyAutomation({
          ...classifyText(text),
          ...(inferredDate ? { date: inferredDate, due: inferredDate } : {}),
        }, state)
      : null
    setPendingDraft(incompleteDraft)
    setAiState(nextDrafts.length ? 'ready' : needsAmount ? 'asking' : 'idle')
    const reply = nextDrafts.length
      ? `Separei ${nextDrafts.length} movimento${nextDrafts.length > 1 ? 's' : ''}, totalizando ${brl(total)}. Confirma o que estiver certo.`
      : needsAmount
        ? `Entendi: ${incompleteDraft.ledger === 'business' ? 'negocio' : 'pessoal'}, ${incompleteDraft.category}. Qual foi o valor?`
        : 'Me fala como aconteceu, por exemplo: paguei 80 no mercado, recebi 300 de cliente ou venceu boleto de internet.'
    speak(reply)
    mutate((current) => ({
      ...current,
      assistant: [
        { id: uid(), role: 'user', text, at: new Date().toISOString() },
        {
          id: uid(),
          role: 'norte',
          text: reply,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    setCommand('')
  }

  function saveDraft(draft) {
    if (!draft?.amount) return
    if (draft.kind === 'obligation') {
      addObligation({
        title: draft.title,
        ledger: draft.ledger,
        type: draft.type === 'income' ? 'receivable' : 'payable',
        amount: draft.amount,
        due: draft.due || draft.date || today(),
        category: draft.category,
      })
    } else {
      addEvent({
        title: draft.title,
        ledger: draft.ledger,
        type: draft.type,
        amount: draft.amount,
        category: draft.category,
        date: draft.date || today(),
      })
    }
    setLastSaved({
      id: uid(),
      title: draft.title,
      amount: draft.amount,
      ledger: draft.ledger,
      kind: draft.kind,
      type: draft.type,
      category: draft.category,
    })
  }

  function updateDraft(draftId, patch) {
    setDrafts((current) => current.map((item) => (item.id === draftId ? { ...item, ...patch } : item)))
  }

  function updateDraftDate(draftId, value) {
    setDrafts((current) => current.map((item) => {
      if (item.id !== draftId) return item
      return item.kind === 'obligation' ? { ...item, due: value } : { ...item, date: value }
    }))
  }

  function dismissDraft(draftId) {
    setDrafts((current) => {
      const next = current.filter((item) => item.id !== draftId)
      if (!next.length) setAiState('idle')
      return next
    })
  }

  function dismissPending() {
    setPendingDraft(null)
    setAiState('idle')
  }

  function confirmDraft(draftId) {
    const draft = drafts.find((item) => item.id === draftId)
    if (!draft) return
    saveDraft(draft)
    const reply = `Salvei ${brl(draft.amount)} em ${draft.ledger === 'business' ? 'Negocio' : 'Pessoal'} e atualizei sua rota financeira.`
    speak(reply)
    mutate((current) => ({
      ...current,
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: reply,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    setDrafts((current) => current.filter((item) => item.id !== draftId))
    setAiState('done')
  }

  function confirmAllDrafts() {
    if (!drafts.length) return
    drafts.forEach(saveDraft)
    const reply = `Tudo salvo. Organizei ${drafts.length} movimento${drafts.length > 1 ? 's' : ''} e recalcularei sua bussola agora.`
    speak(reply)
    mutate((current) => ({
      ...current,
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: reply,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    setDrafts([])
    setAiState('done')
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setMode('command')
      setAiState('listening')
      setCommand('Recebi 240 de cliente e gastei 80 com material')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.onstart = () => {
      setListening(true)
      setAiState('listening')
    }
    recognition.onend = () => {
      setListening(false)
      setAiState((current) => (current === 'listening' ? 'idle' : current))
    }
    recognition.onerror = () => {
      setListening(false)
      setAiState('idle')
    }
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((item) => item[0].transcript).join(' ')
      setMode('command')
      setCommand(transcript)
      handleCommand(transcript)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <main className={`zero-app mode-${mode} theme-${theme}`}>
      {mode !== 'command' && (
        <aside className="app-sidebar">
          <Brand sync={sync} />
          <nav>
            <button type="button" className={mode === 'home' ? 'active' : ''} onClick={() => setMode('home')}>
              <Compass size={19} />
              <span><strong>Inicio</strong><small>sua rota de hoje</small></span>
            </button>
            <button type="button" className={mode === 'wallet' ? 'active' : ''} onClick={() => setMode('wallet')}>
              <WalletCards size={19} />
              <span><strong>Carteira</strong><small>contas e cartoes</small></span>
            </button>
            <button type="button" className={mode === 'planning' ? 'active' : ''} onClick={() => setMode('planning')}>
              <CalendarClock size={19} />
              <span><strong>Planejar</strong><small>limites e compromissos</small></span>
            </button>
            <button type="button" className={mode === 'insights' ? 'active' : ''} onClick={() => setMode('insights')}>
              <Activity size={19} />
              <span><strong>Analises</strong><small>mes e movimentos</small></span>
            </button>
          </nav>
          <button type="button" className="sidebar-ai" onClick={() => setMode('command')}>
            <Sparkles size={20} />
            <span><strong>Norte IA</strong><small>fale ou pergunte</small></span>
          </button>
        </aside>
      )}

      <div className={mode !== 'command' ? 'app-workspace' : undefined}>
      {mode !== 'command' && (
        <header className="zero-top">
          <Brand sync={sync} />
          <button type="button" onClick={() => setMode('command')} className="zero-search">
            <Brain size={17} />
            <span>Pergunte ou registre qualquer coisa</span>
          </button>
          <div className="zero-user">
            <button
              type="button"
              className="theme-toggle"
              title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Fingerprint size={16} />
            <span>{state.person.name}</span>
            {firebaseEnabled && authUser && <button type="button" onClick={logoutFirebase}><LogOut size={16} /></button>}
          </div>
        </header>
      )}

      {mode !== 'command' && (
        <Home
          view={mode}
          state={state}
          finance={finance}
          onCommand={() => setMode('command')}
          onVoice={startVoice}
          openSheet={setSheet}
          settleObligation={settleObligation}
        />
      )}

      {mode === 'command' && (
        <Command
          state={state}
          finance={finance}
          command={command}
          setCommand={setCommand}
          handleCommand={handleCommand}
          drafts={drafts}
          pendingDraft={pendingDraft}
          aiState={aiState}
          lastSaved={lastSaved}
          confirmDraft={confirmDraft}
          confirmAllDrafts={confirmAllDrafts}
          updateDraft={updateDraft}
          updateDraftDate={updateDraftDate}
          dismissDraft={dismissDraft}
          dismissPending={dismissPending}
          listening={listening}
          voiceEnabled={voiceEnabled}
          toggleVoice={() => setVoiceEnabled((current) => !current)}
          onVoice={startVoice}
          onClose={() => setMode('home')}
        />
      )}

      {mode !== 'command' && (
        <nav className={`zero-dock ${dockCompact ? 'compact' : ''}`}>
          <button type="button" className={mode === 'home' ? 'active' : ''} onClick={() => setMode('home')}>
            <Compass size={20} />
            <span>Inicio</span>
          </button>
          <button type="button" className={mode === 'wallet' ? 'active' : ''} onClick={() => setMode('wallet')}>
            <WalletCards size={20} />
            <span>Carteira</span>
          </button>
          <button type="button" className="orb" onClick={() => setMode('command')}>
            <Sparkles size={24} />
            <span>Norte</span>
          </button>
          <button type="button" className={mode === 'planning' ? 'active' : ''} onClick={() => setMode('planning')}>
            <CalendarClock size={20} />
            <span>Planejar</span>
          </button>
          <button type="button" className={mode === 'insights' ? 'active' : ''} onClick={() => setMode('insights')}>
            <Activity size={20} />
            <span>Analises</span>
          </button>
        </nav>
      )}

      {sheet && (
        <ActionSheet
          sheet={sheet}
          close={() => setSheet(null)}
          state={state}
          mutate={mutate}
          addEvent={addEvent}
          addObligation={addObligation}
        />
      )}
      </div>
    </main>
  )
}

function Brand({ sync }) {
  const label = sync === 'ready' ? 'sincronizado' : sync === 'secure' ? 'seguro' : sync === 'demo' ? 'demo vivo' : sync === 'loading' ? 'entrando' : 'modo local'
  return (
    <div className="zero-brand">
      <div><Compass size={20} /></div>
      <span>
        <strong>Norte</strong>
        <small>{label}</small>
      </span>
    </div>
  )
}

function Home({ view, state, finance, onCommand, onVoice, openSheet, settleObligation }) {
  const nextDue = finance.upcoming[0]
  const topGoal = state.goals[0]
  const goalProgress = topGoal ? Math.min(100, Math.round((Number(topGoal.current || 0) / Number(topGoal.target || 1)) * 100)) : 0
  const personalBalance = finance.byLedger.personal?.balance || 0
  const businessBalance = finance.byLedger.business?.balance || 0
  const ledgerTotal = Math.max(1, Math.abs(personalBalance) + Math.abs(businessBalance))
  const personalShare = Math.round((Math.abs(personalBalance) / ledgerTotal) * 100)
  const aiDecisions = state.assistant.filter((message) => message.role === 'norte').slice(0, 2)
  const openAgenda = finance.upcoming.slice(0, 4).map((item) => ({ ...item, feedType: 'obligation' }))
  const recentEvents = state.events.slice(0, 6)
  const activePlan = getActivePlan(state.plan)

  function runAction(action) {
    if (action === 'settle-first' && finance.upcoming[0]) settleObligation(finance.upcoming[0].id)
    if (action === 'connect') openSheet('connect')
    if (action === 'recurrence') openSheet('recurrence')
    if (action === 'card') openSheet({ type: 'card', id: state.cards.find((card) => card.used > 0)?.id || state.cards[0]?.id })
    if (action === 'goal') openSheet('goal')
    if (action === 'command') onCommand()
  }

  return (
    <section className={`zero-home view-${view}`}>
      {view !== 'home' && (
        <header className="view-intro">
          <span>{view === 'wallet' ? 'seu dinheiro' : view === 'planning' ? 'seu proximo passo' : 'sua leitura'}</span>
          <h1>{view === 'wallet' ? 'Carteira' : view === 'planning' ? 'Planejamento' : 'Analises'}</h1>
          <p>
            {view === 'wallet'
              ? 'Contas, cartoes e a separacao entre pessoal e negocio.'
              : view === 'planning'
                ? 'Limites, metas e compromissos antes que virem surpresa.'
                : 'Entenda o mes e encontre para onde seu dinheiro esta indo.'}
          </p>
        </header>
      )}
      <section className="money-hero">
        <div className="hero-copy">
          <p>seu dinheiro agora</p>
          <h1>{brl(finance.totalBalance)}</h1>
          <span>{finance.status}. pessoal e negocio separados por IA.</span>
        </div>
        <div className="card-stack">
          {state.cards.map((card, index) => (
            <button
              className={`live-card tone-${card.tone}`}
              type="button"
              key={card.id}
              style={{ '--i': index }}
              onClick={() => openSheet({ type: 'card', id: card.id })}
            >
              <span>{card.issuer || 'Norte'} - final {card.last4 || '0000'}</span>
              <strong>{card.name}</strong>
              <small>{brl(card.limit - card.used)} livre</small>
            </button>
          ))}
        </div>
      </section>

      <section className="wallet-rail">
        <div className="section-head">
          <h3>Carteira viva</h3>
          <button type="button" onClick={() => openSheet('connect')}>conectar banco</button>
        </div>
        <div className="wallet-grid">
          {state.accounts.slice(0, 4).map((account, index) => (
            <button
              className={`bank-tile tone-${account.ledger === 'business' ? 'electric' : index % 2 ? 'pulse' : 'aurora'}`}
              type="button"
              key={account.id}
              onClick={() => openSheet({ type: 'account', id: account.id })}
            >
              <Landmark size={20} />
              <span>{account.ledger === 'business' ? 'negocio' : 'pessoal'} - {account.connected ? 'conectada' : account.kind}</span>
              <strong>{account.name}</strong>
              <b>{brl(account.balance)}</b>
              <small>{account.connected ? 'Open Finance pronto para sincronizar' : 'saldo controlado pelo Norte'}</small>
            </button>
          ))}
          {!state.accounts.length && (
            <article className="bank-empty">
              <ShieldCheck />
              <strong>Conecte bancos quando estiver pronto.</strong>
              <span>Hoje simulamos a experiencia. A arquitetura ja separa pessoal e negocio para Open Finance depois.</span>
            </article>
          )}
          <button className="plan-tile" type="button" onClick={() => openSheet('plans')}>
            <LockKeyhole size={20} />
            <span>Plano atual</span>
            <strong>{activePlan.name}</strong>
            <small>{state.plan.status === 'trial' ? `${state.plan.trialDays} dias para validar valor` : activePlan.headline}</small>
          </button>
        </div>
        <div className="wallet-cards-row">
          {state.cards.map((card) => {
            const health = getCardHealth(card)
            return (
              <button className={`wallet-card-mini tone-${card.tone} card-${health.tone}`} type="button" key={card.id} onClick={() => openSheet({ type: 'card', id: card.id })}>
                <span>{card.issuer || 'Norte'} - final {card.last4 || '0000'}</span>
                <strong>{card.name}</strong>
                <small>{brl(health.used)} na fatura - vence em {health.daysToDue} dia{health.daysToDue === 1 ? '' : 's'}</small>
                <div className="card-mini-meta">
                  <b>{brl(health.free)} livre</b>
                  <em>{health.usedPercent}% usado</em>
                </div>
                <div className="limit-meter"><i style={{ width: `${Math.min(100, health.usedPercent)}%` }} /></div>
              </button>
            )
          })}
          <button className="wallet-card-mini new-card" type="button" onClick={() => openSheet('new-card')}>
            <Plus size={18} />
            <strong>Novo cartao</strong>
            <small>adicione pessoal ou negocio</small>
          </button>
        </div>
      </section>

      <section className="insight-strip">
        {finance.insights.map((insight) => {
          const Icon = insight.icon
          return (
            <article key={insight.id}>
              <Icon size={18} />
              <span>{insight.label}</span>
              <strong>{insight.value}</strong>
              <small>{insight.text}</small>
            </article>
          )
        })}
      </section>

      <section className="pulse-board">
        <div className="section-head">
          <h3>Radar Norte</h3>
          <button type="button" onClick={onCommand}>pedir leitura</button>
        </div>
        <div className="pulse-grid">
          <article className="pulse-card pulse-primary">
            <Activity size={19} />
            <span>Dinheiro livre</span>
            <strong>{brl(finance.safeToSpend)}</strong>
            <small>{finance.safeToSpend > 0 ? 'pode respirar hoje sem perder a rota' : 'modo cuidado: segure novas saidas'}</small>
          </article>
          <article className="pulse-card">
            <BellRing size={19} />
            <span>Proximo compromisso</span>
            <strong>{nextDue ? brl(nextDue.amount) : 'limpo'}</strong>
            <small>{nextDue ? `${nextDue.title} vence ${dateLabel(nextDue.due)}` : 'nenhuma conta aberta na frente'}</small>
            {nextDue && <button type="button" onClick={() => settleObligation(nextDue.id)}>{nextDue.type === 'receivable' ? 'recebi' : 'paguei'}</button>}
          </article>
          <article className="pulse-card">
            <Target size={19} />
            <span>Meta em foco</span>
            <strong>{topGoal ? `${goalProgress}%` : 'criar meta'}</strong>
            <small>{topGoal ? `${topGoal.title}: ${brl(topGoal.current || 0)} de ${brl(topGoal.target)}` : 'defina um destino para a bussola'}</small>
            <button type="button" onClick={() => (topGoal ? openSheet({ type: 'goal-fund', id: topGoal.id }) : openSheet('goal'))}>
              {topGoal ? 'guardar' : 'nova meta'}
            </button>
          </article>
          <article className="pulse-card ledger-mix">
            <WalletCards size={19} />
            <span>Separacao viva</span>
            <strong>{personalShare}% / {100 - personalShare}%</strong>
            <small>pessoal e negocio em carteiras separadas</small>
            <div>
              <span style={{ width: `${personalShare}%` }} />
              <span style={{ width: `${100 - personalShare}%` }} />
            </div>
          </article>
        </div>
      </section>

      <section className="planning-goals">
        <div className="section-head">
          <h3>Metas em movimento</h3>
          <button type="button" onClick={() => openSheet('goal')}>nova meta</button>
        </div>
        <div className="goal-row">
          {state.goals.slice(0, 4).map((goal) => (
            <article key={goal.id}>
              <Target size={18} />
              <span>{goal.title}</span>
              <strong>{brl(goal.current || 0)} / {brl(goal.target)}</strong>
              <button type="button" onClick={() => openSheet({ type: 'goal-fund', id: goal.id })}>guardar</button>
            </article>
          ))}
          {!state.goals.length && (
            <div className="empty-feed">
              <Target />
              <span>Crie uma meta para dar um destino claro ao dinheiro que sobrar.</span>
            </div>
          )}
        </div>
      </section>

      {!!finance.alerts.length && (
        <section className="smart-alerts">
          <div className="section-head">
            <h3>Alertas inteligentes</h3>
            <button type="button" onClick={onCommand}>conversar</button>
          </div>
          <div className="alert-row">
            {finance.alerts.map((alert) => (
              <button type="button" className={`smart-alert ${alert.tone}`} key={alert.id} onClick={() => runAction(alert.action)}>
                <BellRing size={17} />
                <span>{alert.title}</span>
                <strong>{alert.text}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="report-board">
        <div className="section-head">
          <h3>Leitura do mes</h3>
          <button type="button" onClick={onCommand}>explicar</button>
        </div>
        <div className="report-grid">
          <article className="report-card report-net">
            <span>{finance.report.period}</span>
            <strong>{brl(finance.report.net)}</strong>
            <small>{finance.report.net >= 0 ? 'saldo positivo ate aqui' : 'saidas passaram das entradas'}</small>
          </article>
          <article className="report-card">
            <span>Entradas</span>
            <strong>{brl(finance.report.income)}</strong>
            <small>dinheiro que entrou no mes</small>
          </article>
          <article className="report-card">
            <span>Saidas</span>
            <strong>{brl(finance.report.expense)}</strong>
            <small>gastos, compras e baixas registradas</small>
          </article>
          <article className="report-card report-split">
            <span>Pessoal / Negocio</span>
            <strong>{brl(finance.report.personal)} / {brl(finance.report.business)}</strong>
            <small>resultado separado por vida financeira</small>
          </article>
        </div>
      </section>

      <section className="budget-rhythm">
        <div className="section-head">
          <h3>Ritmo do mes</h3>
          <button type="button" onClick={() => openSheet('budget')}>novo limite</button>
        </div>
        <div className="budget-grid">
          {finance.budgetRhythm.slice(0, 5).map((item) => (
            <button type="button" className={`budget-card ${item.tone}`} key={item.id} onClick={() => openSheet({ type: 'budget', id: item.id })}>
              <div>
                <span>{item.ledger === 'business' ? 'negocio' : 'pessoal'}</span>
                <strong>{item.label}</strong>
                <small>{item.percent >= 100 ? 'passou do limite' : item.percent >= 78 ? 'quase no limite' : `${brl(item.left)} ainda livre`}</small>
              </div>
              <b>{Math.min(999, item.percent)}%</b>
              <div className="budget-bar">
                <i style={{ width: `${Math.min(100, item.percent)}%` }} />
              </div>
              <footer>
                <span>{brl(item.used)} usado</span>
                <span>{brl(item.limit)} limite</span>
              </footer>
            </button>
          ))}
        </div>
      </section>

      <section className="action-plan">
        <div className="section-head">
          <h3>Plano de hoje</h3>
          <button type="button" onClick={onCommand}>perguntar</button>
        </div>
        <div className="plan-grid">
          {finance.nextActions.slice(0, 2).map((item) => (
            <button type="button" className={`plan-card ${item.tone}`} key={item.id} onClick={() => runAction(item.action)}>
              <span>{item.title}</span>
              <strong>{item.text}</strong>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <div className="forecast-line">
          {finance.forecast.map((item, index) => (
            <article key={item.label} style={{ '--step': index }}>
              <span>{item.label}</span>
              <strong>{brl(item.value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="money-map">
        <div className="section-head">
          <h3>Mapa do dinheiro</h3>
          <button type="button" onClick={() => onCommand()}>analisar</button>
        </div>
        <div className="map-summary">
          <article>
            <span>Saidas mapeadas</span>
            <strong>{brl(finance.outflowTotal)}</strong>
          </article>
          <article>
            <span>Pessoal</span>
            <strong>{brl(finance.personalOutflow)}</strong>
          </article>
          <article>
            <span>Negocio</span>
            <strong>{brl(finance.businessOutflow)}</strong>
          </article>
        </div>
        <div className="category-map">
          {finance.moneyMap.map((item) => (
            <article key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <span>{brl(item.amount)} - {item.percent}%</span>
              </div>
              <div className="map-bar">
                <span style={{ width: `${Math.max(7, item.percent)}%` }} />
              </div>
              <div className="category-split">
                <small>Pessoal {brl(item.personal)}</small>
                <small>Negocio {brl(item.business)}</small>
                <b>{item.business > item.personal ? 'pesa mais no negocio' : 'pesa mais no pessoal'}</b>
              </div>
            </article>
          ))}
          {!finance.moneyMap.length && (
            <div className="empty-feed">
              <Activity />
              <span>Registre gastos ou fixos e o Norte mostra para onde o dinheiro esta indo.</span>
            </div>
          )}
        </div>
      </section>

      <section className="autopilot-panel">
        <div className="section-head">
          <h3>Autopiloto</h3>
          <button type="button" onClick={() => openSheet('automation')}>nova regra</button>
        </div>
        <div className="automation-row">
          {state.automations.slice(0, 4).map((rule) => (
            <article key={rule.id}>
              <Sparkles size={17} />
              <span>quando falar</span>
              <strong>{rule.keyword}</strong>
              <small>{rule.ledger === 'business' ? 'Negocio' : 'Pessoal'} - {rule.category}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="recurrence-panel">
        <div className="section-head">
          <h3>Compromissos futuros</h3>
          <button type="button" onClick={() => openSheet('recurrence')}>novo fixo</button>
        </div>
        <div className="commitment-summary">
          <article>
            <span>Reservado</span>
            <strong>{brl(finance.monthlyCommitment)}</strong>
          </article>
          <article>
            <span>Parcelas/mês</span>
            <strong>{brl(finance.installmentMonthly)}</strong>
          </article>
          <article>
            <span>Recebimentos fixos</span>
            <strong>{brl(finance.recurringReceivable)}</strong>
          </article>
        </div>
        <div className="recurrence-row">
          {finance.commitments.map((item) => (
            <article key={item.id}>
              <CalendarClock size={17} />
              <span>{item.label} - {item.ledger === 'business' ? 'Negocio' : 'Pessoal'}</span>
              <strong>{item.title}</strong>
              <small>{brl(item.amount)}</small>
            </article>
          ))}
          {!finance.commitments.length && (
            <div className="empty-feed">
              <CalendarClock />
              <span>Nenhum compromisso ainda. Cadastre fixos ou parcelas para o Norte prever seu mes.</span>
            </div>
          )}
        </div>
      </section>

      <section className="split-ledgers">
        {state.ledgers.map((ledger) => (
          <article className={`ledger-card ${ledger.accent}`} key={ledger.id}>
            <span>{ledger.name}</span>
            <strong>{brl(finance.byLedger[ledger.id]?.balance || 0)}</strong>
            <small>{ledger.intent}</small>
          </article>
        ))}
      </section>

      <section className="zero-actions">
        <button type="button" onClick={onVoice}>
          <Mic />
          <strong>Falar</strong>
          <span>audio vira movimento</span>
        </button>
        <button type="button" onClick={() => openSheet('money')}>
          <Plus />
          <strong>Novo</strong>
          <span>entrada, gasto ou conta</span>
        </button>
        <button type="button" onClick={onCommand}>
          <Brain />
          <strong>Perguntar</strong>
          <span>quanto posso gastar?</span>
        </button>
        <button type="button" onClick={() => openSheet('plans')}>
          <Zap />
          <strong>Norte+</strong>
          <span>planos e recursos futuros</span>
        </button>
      </section>

      <section className="north-compass">
        <div className="compass-meter" style={{ '--score': `${finance.score * 3.6}deg` }}>
          <Compass />
        </div>
        <div>
          <p>bussola</p>
          <h2>{finance.score}%</h2>
          <span>{finance.status}</span>
        </div>
      </section>

      <section className="finance-feed">
        <div className="section-head">
          <h3>Timeline inteligente</h3>
          <button type="button" onClick={() => openSheet('goal')}>meta</button>
        </div>
        {!!state.goals.length && (
          <div className="goal-row">
            {state.goals.slice(0, 3).map((goal) => (
              <article key={goal.id}>
                <Target size={18} />
                <span>{goal.title}</span>
                <strong>{brl(goal.current || 0)} / {brl(goal.target)}</strong>
                <button type="button" onClick={() => openSheet({ type: 'goal-fund', id: goal.id })}>guardar</button>
              </article>
            ))}
          </div>
        )}
        <div className="timeline-grid">
          <section className="timeline-lane ai-lane">
            <span>Decisoes da IA</span>
            {aiDecisions.map((message) => (
              <article className="ai-decision" key={message.id}>
                <Brain size={17} />
                <strong>{message.text}</strong>
              </article>
            ))}
          </section>
          <section className="timeline-lane">
            <span>Agenda aberta</span>
            {openAgenda.map((item) => (
              <article className="feed-item urgent-feed" key={item.id}>
                <div className={`feed-dot ${item.ledger}`}>
                  {item.type === 'receivable' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.category || 'Agenda'} - vence {dateLabel(item.due)}</span>
                </div>
                <div className="feed-value">
                  <b>{brl(item.amount)}</b>
                  <button type="button" onClick={() => settleObligation(item.id)}>
                    {item.type === 'receivable' ? 'recebi' : 'paguei'}
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section className="timeline-lane">
            <span>Movimentos recentes</span>
            {recentEvents.map((item) => (
              <article className="feed-item" key={item.id}>
                <div className={`feed-dot ${item.ledger}`}>
                  {item.type === 'income' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.category || 'Geral'} - {dateLabel(item.date)}
                    {item.installments > 1 ? ` - ${item.installments}x de ${brl(item.installmentAmount)}` : ''}
                  </span>
                </div>
                <div className="feed-value">
                  <b>{brl(item.amount)}</b>
                </div>
              </article>
            ))}
          </section>
        </div>
        {!state.events.length && !finance.upcoming.length && (
          <div className="empty-feed">
            <Sparkles />
            <span>Fale seu primeiro movimento e o Norte monta o feed sozinho.</span>
          </div>
        )}
      </section>
    </section>
  )
}

function Command({
  state,
  finance,
  command,
  setCommand,
  handleCommand,
  drafts,
  pendingDraft,
  aiState,
  lastSaved,
  confirmDraft,
  confirmAllDrafts,
  updateDraft,
  updateDraftDate,
  dismissDraft,
  dismissPending,
  listening,
  voiceEnabled,
  toggleVoice,
  onVoice,
  onClose,
}) {
  const mood = listening ? 'listening' : pendingDraft ? 'asking' : drafts.length ? 'ready' : command.trim() ? 'thinking' : aiState
  const moodText = {
    idle: 'pronta para ouvir',
    listening: 'ouvindo voce',
    thinking: 'entendendo sua fala',
    asking: 'preciso de um detalhe',
    ready: 'pronto para confirmar',
    done: 'rota atualizada',
  }[mood] || 'pronta para ouvir'

  return (
    <section className={`command-mode ai-${mood}`}>
      <div className="command-controls">
        <button type="button" onClick={toggleVoice}>
          {voiceEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          <span>{voiceEnabled ? 'voz ligada' : 'voz muda'}</span>
        </button>
        <button type="button" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="jarvis-orb">
        <span />
        <span />
        <span />
        <Brain size={42} />
        <small>{moodText}</small>
      </div>
      <div className="command-copy">
        <p>Norte IA</p>
        <h1>{state.person.name}, sua rota esta em {finance.score}%.</h1>
        <span>Fale naturalmente. Eu separo pessoal e negocio, pergunto quando faltar dado e so salvo com confirmacao.</span>
        <div className="ai-status">
          <i />
          <strong>{moodText}</strong>
          <span>{drafts.length ? `${drafts.length} rascunho${drafts.length > 1 ? 's' : ''} aguardando sua decisao` : pendingDraft ? 'responda o detalhe que faltou para eu montar a proposta' : 'toque no microfone ou escreva como voce falaria com uma pessoa'}</span>
        </div>
        <div className="command-metrics">
          <article>
            <span>livre hoje</span>
            <strong>{brl(finance.safeToSpend)}</strong>
          </article>
          <article>
            <span>pessoal</span>
            <strong>{brl(finance.byLedger.personal?.balance || 0)}</strong>
          </article>
          <article>
            <span>negocio</span>
            <strong>{brl(finance.byLedger.business?.balance || 0)}</strong>
          </article>
        </div>
      </div>
      <UnderstandingRail state={state} drafts={drafts} pendingDraft={pendingDraft} command={command} />
      <div className="quick-prompts">
        {['Quanto posso gastar?', 'Para onde meu dinheiro vai?', 'Quais contas vencem?', 'Recebi 300 de cliente'].map((item) => (
          <button type="button" key={item} onClick={() => handleCommand(item)}>
            {item}
          </button>
        ))}
      </div>
      {pendingDraft && (
        <article className="pending-question">
          <div>
            <span>faltou um dado</span>
            <strong>Qual foi o valor?</strong>
            <p>
              Eu entendi como {pendingDraft.ledger === 'business' ? 'negocio' : 'pessoal'} em {pendingDraft.category}.
              Responda so o valor, ou diga algo como 120 amanha. Depois voce ajusta categoria e data antes de salvar.
            </p>
            <div className="pending-quick-values">
              {[50, 100, 250, 500].map((value) => (
                <button type="button" key={value} onClick={() => handleCommand(String(value))}>{brl(value)}</button>
              ))}
            </div>
          </div>
          <button type="button" onClick={dismissPending}>cancelar</button>
        </article>
      )}
      <div className="command-bar">
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Ex: vendi 300 no pix e paguei 70 de mercado" />
        <button type="button" onClick={() => handleCommand()}><Send size={19} /></button>
        <button type="button" className={listening ? 'listening' : ''} onClick={onVoice}><Mic size={19} /></button>
      </div>
      {!!drafts.length && (
        <section className="draft-stack">
          <div className="draft-head">
            <span>{drafts.length} item{drafts.length > 1 ? 's' : ''} encontrado{drafts.length > 1 ? 's' : ''}</span>
            <button type="button" onClick={confirmAllDrafts}><Check size={16} /> Confirmar tudo</button>
          </div>
          {drafts.map((draft) => (
            <article className="proposal" key={draft.id}>
              <div className="proposal-main">
                <span>{draft.kind === 'obligation' ? 'Agenda' : 'Movimento'} sugerido</span>
                <strong>{draft.title}</strong>
                <b>{brl(draft.amount)}</b>
              </div>
              <div className="proposal-intelligence">
                <span>{draft.ledger === 'business' ? 'Negocio' : 'Pessoal'}</span>
                <span>{draft.type === 'income' ? 'Entrada' : 'Saida'}</span>
                <span>{dateLabel(draft.kind === 'obligation' ? draft.due : draft.date)}</span>
                <span>{Math.round(Number(draft.confidence || 0.82) * 100)}% de confianca</span>
                <strong>{draftReason(draft)}</strong>
                <small>{draftImpact(draft, finance)}</small>
              </div>
              <div className="proposal-quick-edit">
                <label>
                  <span>descricao</span>
                  <input value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value })} />
                </label>
                <label>
                  <span>valor</span>
                  <input
                    value={draft.amount || ''}
                    inputMode="decimal"
                    onChange={(event) => updateDraft(draft.id, { amount: parseMoney(event.target.value) })}
                  />
                </label>
                <label>
                  <span>{draft.kind === 'obligation' ? 'vencimento' : 'data'}</span>
                  <input
                    type="date"
                    value={draft.kind === 'obligation' ? draft.due : draft.date}
                    onChange={(event) => updateDraftDate(draft.id, event.target.value)}
                  />
                </label>
              </div>
              <div className="proposal-controls">
                <div className="mini-toggle">
                  {['personal', 'business'].map((ledger) => (
                    <button
                      type="button"
                      className={draft.ledger === ledger ? 'active' : ''}
                      key={ledger}
                      onClick={() => updateDraft(draft.id, { ledger })}
                    >
                      {ledger === 'business' ? 'Negocio' : 'Pessoal'}
                    </button>
                  ))}
                </div>
                <div className="mini-toggle">
                  {['expense', 'income'].map((type) => (
                    <button
                      type="button"
                      className={draft.type === type ? 'active' : ''}
                      key={type}
                      onClick={() => updateDraft(draft.id, { type })}
                    >
                      {type === 'income' ? 'Entrada' : 'Saida'}
                    </button>
                  ))}
                </div>
                <select value={draft.category} onChange={(event) => updateDraft(draft.id, { category: event.target.value })}>
                  {draftCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <div className="mini-toggle date-toggle">
                  {[
                    ['Hoje', today()],
                    ['Amanha', addDays(1)],
                    ['7 dias', addDays(7)],
                  ].map(([label, date]) => (
                    <button
                      type="button"
                      className={(draft.kind === 'obligation' ? draft.due : draft.date) === date ? 'active' : ''}
                      key={label}
                      onClick={() => updateDraft(draft.id, draft.kind === 'obligation' ? { due: date } : { date })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="proposal-actions">
                <button type="button" onClick={() => confirmDraft(draft.id)}><Check size={17} /> Confirmar</button>
                <button type="button" className="ghost-action" onClick={() => dismissDraft(draft.id)}><X size={17} /></button>
              </div>
            </article>
          ))}
        </section>
      )}
      {!drafts.length && !pendingDraft && lastSaved && (
        <article className="save-receipt">
          <div>
            <span>salvo na carteira</span>
            <strong>{lastSaved.title}</strong>
            <small>{lastSaved.ledger === 'business' ? 'Negocio' : 'Pessoal'} - {lastSaved.category}</small>
            <em>{lastSaved.type === 'income' ? 'Sua rota recebeu uma entrada nova.' : 'Eu ja considerei essa saida no dinheiro livre.'}</em>
          </div>
          <b>{brl(lastSaved.amount)}</b>
          <div className="receipt-actions">
            <button type="button" onClick={onClose}>Ver carteira</button>
            <button type="button" onClick={() => setCommand('')}>Registrar outro</button>
          </div>
        </article>
      )}
      <div className="assistant-thread">
        {state.assistant.slice(0, 6).map((message) => (
          <p className={message.role} key={message.id}>{message.text}</p>
        ))}
      </div>
    </section>
  )
}

function ActionSheet({ sheet, close, state, mutate, addEvent, addObligation }) {
  const sheetType = typeof sheet === 'string' ? sheet : sheet?.type
  const activeCard = sheetType === 'card' ? state.cards.find((card) => card.id === sheet.id) : null
  const activeAccount = sheetType === 'account' ? state.accounts.find((account) => account.id === sheet.id) : null
  const activeGoal = sheetType === 'goal-fund' ? state.goals.find((goal) => goal.id === sheet.id) : null
  const activeCardHealth = activeCard ? getCardHealth(activeCard) : null
  const activeCardEvents = activeCard ? state.events.filter((event) => event.cardId === activeCard.id).slice(0, 4) : []
  const budgetRhythm = buildBudgetRhythm({ budgets: state.budgets, events: state.events, currentDate: today() })
  const activeBudget = sheetType === 'budget' && sheet?.id ? budgetRhythm.find((item) => item.id === sheet.id) : null
  const budgetSuggestion = suggestBudgetLimit(activeBudget)
  const activePlan = getActivePlan(state.plan)
  const usageRows = getPlanUsageRows(state)

  function submitMoney(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const kind = form.get('kind')
    const payload = {
      title: form.get('title'),
      amount: parseMoney(form.get('amount')),
      ledger: form.get('ledger'),
      category: form.get('category') || 'Geral',
    }
    if (!payload.title || !payload.amount) return
    const automated = applyAutomation(payload, state)
    if (kind === 'bill') addObligation({ ...automated, type: form.get('direction'), due: form.get('date') || today() })
    else addEvent({ ...automated, type: kind, date: form.get('date') || today() })
    close()
  }

  function submitGoal(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutate((current) => ({
      ...current,
      goals: [{ id: uid(), title: form.get('title'), target: parseMoney(form.get('target')), current: 0 }, ...current.goals],
    }))
    close()
  }

  function connectBank(bank) {
    mutate((current) => {
      const withoutBank = current.connections.filter((connection) => connection.id !== bank.id)
      const accountId = `open-${bank.id}`
      const accounts = current.accounts.some((account) => account.id === accountId)
        ? current.accounts.map((account) => (account.id === accountId ? { ...account, balance: bank.balance } : account))
        : [
            ...current.accounts,
            {
              id: accountId,
              ledger: bank.ledger,
              name: bank.name,
              kind: 'bank',
              balance: bank.balance,
              connected: true,
            },
          ]
      return {
        ...current,
        accounts,
        connections: [
          {
            ...bank,
            status: 'ready',
            lastSync: new Date().toISOString(),
          },
          ...withoutBank,
        ],
      }
    })
  }

  function choosePlan(plan) {
    mutate((current) => ({
      ...current,
      plan: {
        id: plan.id,
        tier: plan.name,
        status: 'preview',
        price: plan.price,
        trialDays: current.plan?.trialDays || 14,
      },
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `${plan.name} selecionado. Quando conectarmos Stripe, esse botao vira checkout seguro e portal de assinatura.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
  }

  function submitCardSpend(event) {
    event.preventDefault()
    if (!activeCard) return
    const form = new FormData(event.currentTarget)
    const amount = parseMoney(form.get('amount'))
    const installments = Math.max(1, Math.min(24, Number(form.get('installments') || 1)))
    if (!amount) return
    mutate((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === activeCard.id ? { ...card, used: Number(card.used || 0) + amount } : card)),
      events: [
        {
          id: uid(),
          title: form.get('title') || `Compra no ${activeCard.name}`,
          ledger: activeCard.ledger,
          type: 'expense',
          amount,
          category: form.get('category') || 'Cartao',
          date: today(),
          cardId: activeCard.id,
          installments,
          installmentAmount: amount / installments,
        },
        ...current.events,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: installments > 1
            ? `${form.get('title') || activeCard.name} entrou em ${installments} parcelas de ${brl(amount / installments)}. Vou considerar isso no seu dinheiro livre.`
            : `Compra de ${brl(amount)} no ${activeCard.name} registrada na fatura.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitNewCard(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const limit = parseMoney(form.get('limit'))
    if (!name || !limit) return
    mutate((current) => ({
      ...current,
      cards: [
        {
          id: uid(),
          name,
          ledger: form.get('ledger'),
          limit,
          used: 0,
          dueDay: Math.max(1, Math.min(31, Number(form.get('dueDay') || 10))),
          issuer: 'Norte',
          last4: String(Math.floor(1000 + Math.random() * 9000)),
          tone: form.get('ledger') === 'business' ? 'violet' : 'graphite',
        },
        ...current.cards,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `${name} entrou na carteira. A partir de agora eu considero limite e fatura antes de dizer quanto voce pode gastar.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitAccountMove(event) {
    event.preventDefault()
    if (!activeAccount) return
    const form = new FormData(event.currentTarget)
    const amount = parseMoney(form.get('amount'))
    const direction = form.get('direction')
    if (!amount) return
    const signedAmount = direction === 'out' ? -amount : amount
    mutate((current) => ({
      ...current,
      accounts: current.accounts.map((account) =>
        account.id === activeAccount.id ? { ...account, balance: Number(account.balance || 0) + signedAmount } : account,
      ),
      events: [
        {
          id: uid(),
          title: form.get('title') || (direction === 'out' ? `Saida em ${activeAccount.name}` : `Entrada em ${activeAccount.name}`),
          ledger: activeAccount.ledger,
          type: direction === 'out' ? 'expense' : 'income',
          amount,
          category: form.get('category') || 'Carteira',
          date: today(),
          accountId: activeAccount.id,
        },
        ...current.events,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `${activeAccount.name} atualizado com ${direction === 'out' ? 'saida' : 'entrada'} de ${brl(amount)}. Separei em ${activeAccount.ledger === 'business' ? 'Negocio' : 'Pessoal'}.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitAutomation(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const keyword = String(form.get('keyword') || '').trim()
    if (!keyword) return
    mutate((current) => ({
      ...current,
      automations: [
        {
          id: uid(),
          keyword,
          ledger: form.get('ledger'),
          category: form.get('category') || 'Geral',
          enabled: true,
        },
        ...current.automations,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `Regra criada. Quando voce falar "${keyword}", eu ja separo antes de pedir confirmacao.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitRecurrence(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    const amount = parseMoney(form.get('amount'))
    if (!title || !amount) return
    mutate((current) => ({
      ...current,
      recurrences: [
        {
          id: uid(),
          title,
          amount,
          ledger: form.get('ledger'),
          type: form.get('type'),
          day: Math.max(1, Math.min(31, Number(form.get('day') || 1))),
          category: form.get('category') || 'Conta fixa',
          active: true,
        },
        ...current.recurrences,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `${title} entrou nos fixos do mes. Agora eu considero isso antes de dizer quanto voce pode gastar.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitBudget(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const category = String(form.get('category') || 'Geral')
    const limit = parseMoney(form.get('limit'))
    if (!limit) return
    const nextBudget = {
      id: activeBudget?.id || uid(),
      ledger: form.get('ledger'),
      category,
      label: String(form.get('label') || category).trim() || category,
      limit,
    }
    mutate((current) => ({
      ...current,
      budgets: activeBudget
        ? current.budgets.map((budget) => (budget.id === activeBudget.id ? nextBudget : budget))
        : [nextBudget, ...current.budgets],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `${nextBudget.label} agora tem limite de ${brl(limit)} no ${nextBudget.ledger === 'business' ? 'Negocio' : 'Pessoal'}. Vou avisar antes de voce passar do ponto.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function payCard() {
    if (!activeCard?.used) return
    mutate((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === activeCard.id ? { ...card, used: 0 } : card)),
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `Fatura do ${activeCard.name} marcada como paga. Seu limite voltou e sua rota foi atualizada.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  function submitGoalFund(event) {
    event.preventDefault()
    if (!activeGoal) return
    const form = new FormData(event.currentTarget)
    const amount = parseMoney(form.get('amount'))
    if (!amount) return
    mutate((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === activeGoal.id ? { ...goal, current: Number(goal.current || 0) + amount } : goal,
      ),
      events: [
        {
          id: uid(),
          title: `Aporte em ${activeGoal.title}`,
          ledger: form.get('ledger') || 'personal',
          type: 'expense',
          amount,
          category: 'Meta',
          date: today(),
        },
        ...current.events,
      ],
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `Guardei ${brl(amount)} para ${activeGoal.title}. Isso deixa sua meta mais perto sem misturar com gasto comum.`,
          at: new Date().toISOString(),
        },
        ...current.assistant,
      ],
    }))
    close()
  }

  return (
    <div className="sheet-backdrop">
      <section className="sheet">
        <button className="sheet-close" type="button" onClick={close}><X size={18} /></button>
        {sheetType === 'money' && (
          <form onSubmit={submitMoney}>
            <h2>Novo registro</h2>
            <input name="title" placeholder="O que aconteceu?" />
            <input name="amount" placeholder="Valor" inputMode="decimal" />
            <select name="category" defaultValue="Geral">
              <option value="Geral">Geral</option>
              <option value="Vendas">Vendas</option>
              <option value="Pix">Pix</option>
              <option value="Mercado">Mercado</option>
              <option value="Operacao">Operacao</option>
              <option value="Conta fixa">Conta fixa</option>
              <option value="Meta">Meta</option>
            </select>
            <select name="ledger" defaultValue="personal">
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <select name="kind" defaultValue="expense">
              <option value="expense">Gasto agora</option>
              <option value="income">Recebimento agora</option>
              <option value="bill">Conta futura</option>
            </select>
            <select name="direction" defaultValue="payable">
              <option value="payable">A pagar</option>
              <option value="receivable">A receber</option>
            </select>
            <input name="date" type="date" defaultValue={today()} />
            <button type="submit">Salvar</button>
          </form>
        )}
        {sheetType === 'goal' && (
          <form onSubmit={submitGoal}>
            <h2>Nova meta</h2>
            <input name="title" placeholder="Ex: reserva, viagem, equipamento" />
            <input name="target" placeholder="Valor alvo" inputMode="decimal" />
            <button type="submit">Criar meta</button>
          </form>
        )}
        {sheetType === 'automation' && (
          <form onSubmit={submitAutomation}>
            <h2>Nova regra IA</h2>
            <p>Ensine o Norte a separar sozinho antes de salvar.</p>
            <input name="keyword" placeholder="Ex: cliente, mercado, fornecedor" />
            <select name="ledger" defaultValue="business">
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <select name="category" defaultValue="Geral">
              <option value="Vendas">Vendas</option>
              <option value="Mercado">Mercado</option>
              <option value="Operacao">Operacao</option>
              <option value="Conta fixa">Conta fixa</option>
              <option value="Marketing">Marketing</option>
              <option value="Geral">Geral</option>
            </select>
            <button type="submit">Ativar regra</button>
          </form>
        )}
        {sheetType === 'recurrence' && (
          <form onSubmit={submitRecurrence}>
            <h2>Novo fixo mensal</h2>
            <p>Contas, assinaturas, fornecedores e recebimentos que voltam todo mes.</p>
            <input name="title" placeholder="Ex: aluguel, internet, cliente mensal" />
            <input name="amount" placeholder="Valor" inputMode="decimal" />
            <input name="day" placeholder="Dia do mes" inputMode="numeric" />
            <select name="ledger" defaultValue="personal">
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <select name="type" defaultValue="payable">
              <option value="payable">Conta fixa</option>
              <option value="receivable">Recebimento fixo</option>
            </select>
            <select name="category" defaultValue="Conta fixa">
              <option value="Conta fixa">Conta fixa</option>
              <option value="Assinatura">Assinatura</option>
              <option value="Operacao">Operacao</option>
              <option value="Vendas">Vendas</option>
              <option value="Marketing">Marketing</option>
            </select>
            <button type="submit">Salvar fixo</button>
          </form>
        )}
        {sheetType === 'budget' && (
          <form className="budget-sheet" onSubmit={submitBudget}>
            <h2>{activeBudget ? `Ajustar ${activeBudget.label}` : 'Novo limite vivo'}</h2>
            <p>Escolha um ritmo confortavel. O Norte acompanha e te chama antes de virar problema.</p>
            {activeBudget && (
              <div className={`budget-sheet-preview ${activeBudget.tone}`}>
                <span>{activeBudget.ledger === 'business' ? 'Negocio' : 'Pessoal'}</span>
                <strong>{activeBudget.percent}% usado</strong>
                <small>{brl(activeBudget.used)} usados de {brl(activeBudget.limit)}. Restam {brl(activeBudget.left)}.</small>
                <div className="budget-bar"><i style={{ width: `${Math.min(100, activeBudget.percent)}%` }} /></div>
              </div>
            )}
            <div className="ai-suggestion">
              <Sparkles size={18} />
              <span>
                <strong>Sugestao Norte: {brl(budgetSuggestion)}</strong>
                <small>{activeBudget ? 'calculei pelo uso atual com uma folga pequena' : 'bom ponto de partida para sentir o mes'}</small>
              </span>
            </div>
            <input name="label" placeholder="Nome do limite" defaultValue={activeBudget?.label || ''} />
            <select name="ledger" defaultValue={activeBudget?.ledger || 'personal'}>
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <select name="category" defaultValue={activeBudget?.category || 'Mercado'}>
              {[...new Set([...draftCategories, 'Marketing', 'Meta', 'Cartoes'])].map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input name="limit" placeholder="Limite do mes" inputMode="decimal" defaultValue={activeBudget?.limit || budgetSuggestion} />
            <button type="submit">{activeBudget ? 'Atualizar limite' : 'Criar limite'}</button>
          </form>
        )}
        {sheetType === 'connect' && (
          <div className="sheet-stack">
            <h2>Conexao bancaria</h2>
            <p>Open Finance entra aqui depois. Agora voce ja pode sentir a carteira conectada e separada por pessoal ou negocio.</p>
            <div className="bank-list">
              {availableBanks.map((bank) => {
                const connected = state.connections.some((item) => item.id === bank.id)
                return (
                  <button type="button" key={bank.id} onClick={() => connectBank(bank)} className={connected ? 'connected' : ''}>
                    <Landmark size={18} />
                    <span>
                      <strong>{bank.name}</strong>
                      <small>{bank.ledger === 'business' ? 'Conta do negocio' : 'Conta pessoal'} - {brl(bank.balance)}</small>
                    </span>
                    {connected ? <Check size={18} /> : <Plus size={18} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {sheetType === 'plans' && (
          <div className="sheet-stack">
            <h2>Assinatura Norte</h2>
            <p>Planos mensais para evoluir de controle pessoal + negocio ate operacao financeira com IA.</p>
            <div className="plan-current">
              <div>
                <span>plano ativo</span>
                <strong>{activePlan.name}</strong>
                <small>{activePlan.headline}</small>
              </div>
              <b>{brl(activePlan.price)}<small>{activePlan.billing}</small></b>
            </div>
            <div className="plan-list">
              {plans.map((plan) => (
                <button type="button" key={plan.id} onClick={() => choosePlan(plan)} className={state.plan.tier === plan.name ? 'selected' : ''}>
                  <CreditCard size={18} />
                  <span>
                    <small>{plan.badge}</small>
                    <strong>{plan.name}</strong>
                    <small>{plan.text}</small>
                    <em>{plan.features.join(' - ')}</em>
                  </span>
                  <b>{brl(plan.price)}<small>{plan.billing}</small></b>
                </button>
              ))}
            </div>
            <div className="plan-usage">
              <div className="usage-title">
                <span>Uso do mes</span>
                <strong>Limites do {activePlan.name}</strong>
              </div>
              {usageRows.map((row) => {
                const unlimited = row.limit === 'unlimited'
                const percent = unlimited ? 34 : Math.min(100, Math.round((row.used / Math.max(1, row.limit)) * 100))
                return (
                  <div className="usage-row" key={row.id}>
                    <span>{row.label}</span>
                    <b>{row.used} / {planFormat(row.limit)}</b>
                    <div className={unlimited ? 'usage-bar unlimited' : 'usage-bar'}><i style={{ width: `${percent}%` }} /></div>
                  </div>
                )
              })}
            </div>
            <div className="plan-proof">
              <CalendarClock size={18} />
              <span>Stripe-ready: checkout, trial, upgrade/downgrade e portal do cliente entram aqui. Hoje a escolha fica simulada e salva no estado do app.</span>
            </div>
          </div>
        )}
        {sheetType === 'account' && activeAccount && (
          <div className="sheet-stack">
            <h2>{activeAccount.name}</h2>
            <div className={`account-detail ${activeAccount.ledger}`}>
              <span>{activeAccount.ledger === 'business' ? 'Carteira do negocio' : 'Carteira pessoal'}</span>
              <strong>{brl(activeAccount.balance)}</strong>
              <small>{activeAccount.connected ? 'conectada para Open Finance' : 'controlada manualmente pelo Norte'}</small>
            </div>
            <form className="account-actions" onSubmit={submitAccountMove}>
              <input name="title" placeholder="Descricao rapida" />
              <input name="amount" placeholder="Valor" inputMode="decimal" />
              <select name="direction" defaultValue="in">
                <option value="in">Entrada</option>
                <option value="out">Saida</option>
              </select>
              <select name="category" defaultValue="Carteira">
                <option value="Carteira">Carteira</option>
                <option value="Pix">Pix</option>
                <option value="Vendas">Vendas</option>
                <option value="Mercado">Mercado</option>
                <option value="Operacao">Operacao</option>
              </select>
              <button type="submit">Atualizar saldo</button>
            </form>
          </div>
        )}
        {sheetType === 'new-card' && (
          <form onSubmit={submitNewCard}>
            <h2>Novo cartao</h2>
            <p>Crie um cartao para acompanhar limite, fatura e compras parceladas.</p>
            <input name="name" placeholder="Nome do cartao" />
            <input name="limit" placeholder="Limite" inputMode="decimal" />
            <input name="dueDay" placeholder="Dia de vencimento" inputMode="numeric" />
            <select name="ledger" defaultValue="personal">
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <button type="submit">Adicionar cartao</button>
          </form>
        )}
        {sheetType === 'card' && activeCard && (
          <div className="sheet-stack">
            <h2>{activeCard.name}</h2>
            <div className={`card-detail tone-${activeCard.tone} card-${activeCardHealth.tone}`}>
              <span>{activeCard.ledger === 'business' ? 'Cartao do negocio' : 'Cartao pessoal'}</span>
              <strong>{brl(activeCardHealth.free)} livre</strong>
              <small>Fatura atual: {brl(activeCardHealth.used)} - vence {dateLabel(activeCardHealth.due)}</small>
              <div className="card-health-grid">
                <span>{activeCardHealth.usedPercent}% usado</span>
                <span>{activeCardHealth.daysToDue} dia{activeCardHealth.daysToDue === 1 ? '' : 's'} para vencer</span>
                <span>{brl(activeCardHealth.limit)} limite</span>
              </div>
              <div className="limit-meter"><i style={{ width: `${Math.min(100, activeCardHealth.usedPercent)}%` }} /></div>
            </div>
            <div className="card-impact">
              <CreditCard size={18} />
              <span>
                <strong>{activeCardHealth.tone === 'danger' ? 'Fatura pesada para a rota' : activeCardHealth.tone === 'warning' ? 'Cartao merece atencao' : 'Cartao sob controle'}</strong>
                <small>{brl(activeCardHealth.used)} ja entra no dinheiro reservado antes do Norte dizer quanto voce pode gastar.</small>
              </span>
            </div>
            <form onSubmit={submitCardSpend}>
              <input name="title" placeholder="Compra rapida no cartao" />
              <input name="amount" placeholder="Valor" inputMode="decimal" />
              <select name="installments" defaultValue="1">
                <option value="1">A vista</option>
                <option value="2">2 parcelas</option>
                <option value="3">3 parcelas</option>
                <option value="6">6 parcelas</option>
                <option value="10">10 parcelas</option>
                <option value="12">12 parcelas</option>
              </select>
              <select name="category" defaultValue="Cartao">
                <option value="Cartao">Cartao</option>
                <option value="Mercado">Mercado</option>
                <option value="Operacao">Operacao</option>
                <option value="Marketing">Marketing</option>
                <option value="Transporte">Transporte</option>
              </select>
              <button type="submit">Adicionar compra</button>
            </form>
            <button className="secondary-sheet-action" type="button" onClick={payCard} disabled={!activeCard.used}>
              Marcar fatura como paga
            </button>
            {!!activeCardEvents.length && (
              <div className="card-events">
                <span>ultimas compras</span>
                {activeCardEvents.map((event) => (
                  <article key={event.id}>
                    <strong>{event.title}</strong>
                    <small>{event.category} - {dateLabel(event.date)}</small>
                    <b>{brl(event.amount)}</b>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
        {sheetType === 'goal-fund' && activeGoal && (
          <form onSubmit={submitGoalFund}>
            <h2>Guardar em {activeGoal.title}</h2>
            <p>{brl(activeGoal.current || 0)} guardado de {brl(activeGoal.target)}.</p>
            <input name="amount" placeholder="Quanto guardar agora?" inputMode="decimal" />
            <select name="ledger" defaultValue="personal">
              {state.ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
            </select>
            <button type="submit">Guardar dinheiro</button>
          </form>
        )}
      </section>
    </div>
  )
}

function Onboarding({ onDone }) {
  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onDone({
      ...defaultState,
      onboarded: true,
      person: {
        name: form.get('name') || 'Voce',
        workName: form.get('workName') || 'Meu negocio',
        mode: 'hybrid',
        profile: form.get('profile') || 'mei',
        pain: form.get('pain') || 'mixing',
      },
      accounts: defaultState.accounts.map((account) => ({
        ...account,
        balance: account.ledger === 'personal' ? parseMoney(form.get('personal')) : parseMoney(form.get('business')),
      })),
      assistant: [
        {
          id: uid(),
          role: 'norte',
          text: `Pronto, ${form.get('name') || 'Voce'}. Vou separar pessoal e negocio, perguntar quando faltar dado e te mostrar quanto pode gastar antes de voce se enrolar.`,
          at: new Date().toISOString(),
        },
        ...defaultState.assistant,
      ],
    })
  }
  return (
    <main className="zero-onboarding">
      <section className="onboarding-story">
        <Brand sync="ready" />
        <div className="onboarding-copy">
          <p>fintech pessoal + negocio</p>
          <h1>Seu dinheiro em uma experiencia so. Separado pela IA.</h1>
          <span>O Norte nasceu para quem nao consegue manter app financeiro por mais de uma semana.</span>
        </div>
        <div className="onboarding-preview">
          <div className="preview-card preview-card-main">
            <small>Carteira Norte</small>
            <strong>pessoal + negocio</strong>
            <span>IA separando cada movimento antes de salvar</span>
          </div>
          <div className="preview-card preview-card-side">
            <small>Bussola</small>
            <strong>82%</strong>
            <span>quase no norte</span>
          </div>
        </div>
      </section>
      <form className="onboarding-panel" onSubmit={submit}>
        <div className="setup-head">
          <span>setup em 40 segundos</span>
          <h2>Monte sua primeira carteira.</h2>
          <p>A IA ja entra sabendo que voce tem duas vidas financeiras: a sua e a do seu trabalho.</p>
        </div>
        <div className="setup-grid">
          <label>
            <span>como devo te chamar?</span>
            <input name="name" placeholder="Seu nome" />
          </label>
          <label>
            <span>qual e o nome do seu trabalho?</span>
            <input name="workName" placeholder="Nome do negocio ou trabalho" />
          </label>
          <fieldset className="setup-choice-group">
            <legend>qual e sua fase?</legend>
            <div className="setup-choice-grid">
              {[
                ['mei', 'MEI'],
                ['freelancer', 'Freela'],
                ['autonomo', 'Autonomo'],
                ['extra', 'Renda extra'],
              ].map(([value, label], index) => (
                <label key={value}>
                  <input type="radio" name="profile" value={value} defaultChecked={index === 0} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="setup-choice-group">
            <legend>o que mais te atrapalha?</legend>
            <div className="setup-choice-grid pain-grid">
              {[
                ['mixing', 'Misturo pessoal e negocio'],
                ['focus', 'Nao consigo manter app'],
                ['bills', 'Esqueco contas'],
                ['spend', 'Nao sei quanto posso gastar'],
              ].map(([value, label], index) => (
                <label key={value}>
                  <input type="radio" name="pain" value={value} defaultChecked={index === 0} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <span>saldo pessoal agora</span>
            <input name="personal" placeholder="Ex: 1200" inputMode="decimal" />
          </label>
          <label>
            <span>saldo do negocio agora</span>
            <input name="business" placeholder="Ex: 3500" inputMode="decimal" />
          </label>
        </div>
        <div className="setup-proof">
          <span>Depois disso voce pode falar: "recebi 300 de cliente" ou "paguei mercado 80".</span>
        </div>
        <button type="submit">Entrar no Norte <ChevronRight size={18} /></button>
      </form>
    </main>
  )
}

function Auth({ onDemo }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'login') await loginWithEmail(email, password)
      else await registerWithEmail(email, password)
    } catch {
      setMessage('Nao consegui entrar. Confira os dados e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  async function recover() {
    try {
      await resetFirebasePassword(email)
      setMessage('Link de recuperacao enviado.')
    } catch {
      setMessage('Digite seu email para recuperar.')
    }
  }

  return (
    <main className="zero-auth">
      <section className="auth-story">
        <Brand sync="secure" />
        <div className="auth-copy">
          <h1>Entre no Norte.</h1>
          <p>Uma fintech com IA para separar vida pessoal e negocio sem voce precisar virar planilha.</p>
        </div>
        <div className="auth-proof-card">
          <Brain size={22} />
          <span>Norte IA</span>
          <strong>"Recebi 300 de cliente"</strong>
          <small>vai para negocio, categoria Vendas, aguardando confirmacao</small>
        </div>
      </section>
      <form onSubmit={submit}>
        <h2>{mode === 'login' ? 'Acessar' : 'Criar conta'}</h2>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Senha" />
        {message && <span className="auth-message">{message}</span>}
        <button type="submit" disabled={busy}>{busy ? 'Aguarde' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        <button className="demo-entry" type="button" onClick={onDemo}>
          Experimentar agora <ChevronRight size={17} />
        </button>
        <span className="demo-note">Entre em uma carteira pronta e sinta a IA organizando pessoal + negocio.</span>
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Criar conta' : 'Ja tenho conta'}
        </button>
        {mode === 'login' && <button type="button" onClick={recover}>Esqueci minha senha</button>}
      </form>
    </main>
  )
}

export default App
