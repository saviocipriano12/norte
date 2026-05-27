import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Briefcase,
  Calendar,
  Check,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Home,
  Landmark,
  Mic,
  Package,
  PieChart,
  Plus,
  ReceiptText,
  RotateCcw,
  Send,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import './App.css'
import {
  firebaseEnabled,
  loadFirebaseState,
  loginWithEmail,
  logoutFirebase,
  registerWithEmail,
  saveFirebaseState,
  watchAuth,
  workspaceIdFor,
} from './firebaseClient'
import {
  cancelPurchaseService,
  cancelSaleService,
  createPurchaseOperation,
  createSaleOperation,
} from './services/operationsService'
import { parseEntry } from './services/entryParserService'

const profileOptions = [
  {
    id: 'services',
    label: 'Presto serviços',
    example: 'manicure, barbeiro, consultor, eletricista',
    focus: ['agenda leve', 'clientes', 'contas a receber'],
  },
  {
    id: 'products',
    label: 'Vendo produtos',
    example: 'loja, revenda, e-commerce, cosmeticos',
    focus: ['estoque', 'margem', 'fornecedores'],
  },
  {
    id: 'production',
    label: 'Produzo para vender',
    example: 'restaurante, confeitaria, artesanato',
    focus: ['materiais', 'ficha tecnica', 'reposicao'],
  },
  {
    id: 'projects',
    label: 'Trabalho por projetos',
    example: 'agencia, freelancer, social media, arquitetura',
    focus: ['contratos', 'parcelas', 'lucro por projeto'],
  },
  {
    id: 'hybrid',
    label: 'Misturo mais de um',
    example: 'servico + produto, loja + encomenda',
    focus: ['operacao flexivel', 'pessoal e negocio', 'metas'],
  },
]

const navItems = [
  { id: 'today', label: 'Hoje', icon: Home },
  { id: 'launch', label: 'Lançar', icon: Plus },
  { id: 'assistant', label: 'Decidir', icon: Sparkles },
  { id: 'sales', label: 'Vendas', icon: ShoppingCart },
  { id: 'purchases', label: 'Compras', icon: Package },
  { id: 'business', label: 'Negócio', icon: Briefcase },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'bills', label: 'Contas', icon: Bell },
  { id: 'personal', label: 'Pessoal', icon: Wallet },
  { id: 'reports', label: 'Relatórios', icon: PieChart },
  { id: 'goals', label: 'Metas', icon: Target },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

const categories = {
  income: ['Venda', 'Serviço', 'Recebimento', 'Salário', 'Outros ganhos'],
  expense: ['Mercadoria', 'Material', 'Alimentação', 'Transporte', 'Conta fixa', 'Marketing', 'Casa', 'Outros gastos'],
  transfer: ['Retirada', 'Reserva', 'Movimentação'],
}

const createId = () =>
  window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const today = () => new Date().toISOString().slice(0, 10)

const money = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))

const number = (value) =>
  new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const parseAmountInput = (value) => {
  const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.')
  return Number(normalized || 0)
}

const normalizeText = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const getDefaultAccountId = (accounts, scope) =>
  accounts.find((account) => account.scope === scope)?.id ||
  accounts.find((account) => account.scope === 'both')?.id ||
  accounts[0]?.id ||
  ''

const getAccountOptions = (accounts, scope) =>
  accounts.filter((account) => account.scope === scope || account.scope === 'both')

const getBusinessBalance = (accountBalances) =>
  accountBalances.filter((account) => account.scope !== 'personal').reduce((acc, account) => acc + Number(account.current || 0), 0)

const getPersonalBalance = (accountBalances) =>
  accountBalances.filter((account) => account.scope !== 'business').reduce((acc, account) => acc + Number(account.current || 0), 0)

const draftNeedsReview = (draft) => !draft.amount || !draft.accountId || !draft.category || !draft.title

const buildCatalog = (profile) => {
  const common = [
    { id: createId(), name: 'Servi?o principal', type: 'service', price: 0, cost: 0, stock: null, minStock: null },
    { id: createId(), name: 'Produto principal', type: 'product', price: 0, cost: 0, stock: 0, minStock: 0 },
  ]

  const byProfile = {
    services: [
      { id: createId(), name: 'Servi?o principal', type: 'service', price: 0, cost: 0, stock: null, minStock: null },
      { id: createId(), name: 'Material de atendimento', type: 'material', price: 0, cost: 0, stock: 0, minStock: 0 },
    ],
    products: [
      { id: createId(), name: 'Produto principal', type: 'product', price: 0, cost: 0, stock: 0, minStock: 0 },
      { id: createId(), name: 'Mercadoria para revenda', type: 'material', price: 0, cost: 0, stock: 0, minStock: 0 },
    ],
    production: [
      { id: createId(), name: 'Produto produzido', type: 'product', price: 0, cost: 0, stock: 0, minStock: 0 },
      { id: createId(), name: 'Material principal', type: 'material', price: 0, cost: 0, stock: 0, minStock: 0 },
      { id: createId(), name: 'Embalagem ou insumo', type: 'material', price: 0, cost: 0, stock: 0, minStock: 0 },
    ],
    projects: [
      { id: createId(), name: 'Projeto principal', type: 'project', price: 0, cost: 0, stock: null, minStock: null },
      { id: createId(), name: 'Hora t?cnica', type: 'service', price: 0, cost: 0, stock: null, minStock: null },
    ],
    hybrid: common,
  }

  return byProfile[profile] || common
}

const starterData = {
  onboarded: false,
  user: {
    name: 'Voc?',
    businessName: 'Meu neg?cio',
    profile: 'hybrid',
  },
  accounts: [
    { id: 'personal-wallet', name: 'Carteira pessoal', scope: 'personal', type: 'cash', balance: 0 },
    { id: 'business-cash', name: 'Caixa do neg?cio', scope: 'business', type: 'cash', balance: 0 },
    { id: 'bank', name: 'Banco', scope: 'both', type: 'bank', balance: 0 },
    { id: 'card', name: 'Cart?o', scope: 'personal', type: 'card', balance: 0 },
  ],
  transactions: [],
  catalog: buildCatalog('hybrid'),
  goals: [],
  clients: [],
  sales: [],
  suppliers: [],
  purchases: [],
  bills: [],
  settings: {
    dailyReminder: true,
    privacyMode: false,
    currency: 'BRL',
  },
}

function migrateData(data) {
  return {
    ...starterData,
    ...data,
    user: { ...starterData.user, ...(data?.user || {}) },
    accounts: data?.accounts?.length ? data.accounts : starterData.accounts,
    transactions: data?.transactions || starterData.transactions,
    catalog: data?.catalog?.length ? data.catalog : starterData.catalog,
    goals: data?.goals || starterData.goals,
    clients: data?.clients || starterData.clients,
    sales: data?.sales || starterData.sales,
    suppliers: data?.suppliers || starterData.suppliers,
    purchases: data?.purchases || starterData.purchases,
    bills: data?.bills || starterData.bills,
    settings: { ...starterData.settings, ...(data?.settings || {}) },
    meta: { ...(data?.meta || {}) },
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

function useAppData() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!firebaseEnabled)

  useEffect(() => {
    if (!firebaseEnabled) return undefined
    return watchAuth((firebaseUser) => {
      setUser(firebaseUser)
      setAuthReady(true)
      if (!firebaseUser) setData(null)
    })
  }, [])

  useEffect(() => {
    if (firebaseEnabled && (!authReady || !user)) return undefined
    let active = true

    const loader = firebaseEnabled ? loadFirebaseState(user.uid).then((state) => ({ data: state })) : fetchJson('/api/state')

    loader
      .then((payload) => {
        if (!active) return
        setData(payload.data ? migrateData(payload.data) : starterData)
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setData(starterData)
        setStatus('offline')
      })

    return () => {
      active = false
    }
  }, [authReady, user])

  useEffect(() => {
    if (!data || status === 'loading') return
    const timeout = window.setTimeout(() => {
      const saver = firebaseEnabled && user
        ? saveFirebaseState(user.uid, data)
        : fetchJson('/api/state', {
            method: 'PUT',
            body: JSON.stringify({ data }),
          })
      Promise.resolve(saver).catch(() => setStatus('offline'))
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [data, status, user])

  return [data, setData, status, user, authReady]
}

function App() {
  const [data, setData, dataStatus, firebaseUser, authReady] = useAppData()
  const [active, setActive] = useState('today')
  const [quickText, setQuickText] = useState('')
  const [drafts, setDrafts] = useState([])
  const [defaultScope, setDefaultScope] = useState('business')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const [manual, setManual] = useState({
    type: 'expense',
    scope: 'business',
    title: '',
    amount: '',
    category: 'Outros gastos',
    accountId: '',
    date: today(),
  })
  const [newGoal, setNewGoal] = useState({ title: '', target: '', due: '' })
  const [newCatalogItem, setNewCatalogItem] = useState({ name: '', type: 'service', price: '', cost: '', stock: '', minStock: '' })
  const [newAccount, setNewAccount] = useState({ name: '', scope: 'business', type: 'cash', balance: '' })
  const [newClient, setNewClient] = useState({ name: '', phone: '', receivable: '', due: '', notes: '' })
  const [newBill, setNewBill] = useState({ title: '', type: 'payable', scope: 'business', amount: '', due: '', category: 'Conta fixa' })
  const [goalDrafts, setGoalDrafts] = useState({})
  const firstCatalogItem = data?.catalog?.[0]
  const [newSale, setNewSale] = useState({
    clientName: '',
    itemId: firstCatalogItem?.id || '',
    quantity: '1',
    unitPrice: firstCatalogItem?.price || '',
    status: 'paid',
    date: today(),
    due: today(),
    notes: '',
  })
  const [newPurchase, setNewPurchase] = useState({
    supplierName: '',
    itemId: firstCatalogItem?.id || '',
    quantity: '1',
    unitCost: firstCatalogItem?.cost || '',
    status: 'paid',
    date: today(),
    due: today(),
    notes: '',
  })

  const productionNeedsFirebase = import.meta.env.PROD && !firebaseEnabled

  const transactions = useMemo(
    () => [...data.transactions].sort((a, b) => `${b.date}`.localeCompare(`${a.date}`)),
    [data.transactions],
  )

  const totals = useMemo(() => {
    const todayDate = today()
    const sum = (items, predicate) => items.filter(predicate).reduce((acc, item) => acc + Number(item.amount || 0), 0)
    const todayItems = data.transactions.filter((item) => item.date === todayDate)
    const businessItems = data.transactions.filter((item) => item.scope === 'business')
    const personalItems = data.transactions.filter((item) => item.scope === 'personal')
    return {
      todayIncome: sum(todayItems, (item) => item.type === 'income'),
      todayExpense: sum(todayItems, (item) => item.type === 'expense'),
      businessIncome: sum(businessItems, (item) => item.type === 'income'),
      businessExpense: sum(businessItems, (item) => item.type === 'expense'),
      personalIncome: sum(personalItems, (item) => item.type === 'income'),
      personalExpense: sum(personalItems, (item) => item.type === 'expense'),
      receivable: data.clients.reduce((acc, client) => acc + Number(client.receivable || 0), 0),
      billsReceivable: data.bills.filter((bill) => bill.status !== 'paid' && bill.type === 'receivable').reduce((acc, bill) => acc + Number(bill.amount || 0), 0),
      billsPayable: data.bills.filter((bill) => bill.status !== 'paid' && bill.type === 'payable').reduce((acc, bill) => acc + Number(bill.amount || 0), 0),
    }
  }, [data])

  const accountBalances = useMemo(
    () =>
      data.accounts.map((account) => {
        const movement = data.transactions
          .filter((item) => item.accountId === account.id)
          .reduce((acc, item) => {
            if (item.type === 'income') return acc + Number(item.amount || 0)
            if (item.type === 'expense') return acc - Number(item.amount || 0)
            return acc
          }, 0)
        return { ...account, current: Number(account.balance || 0) + movement }
      }),
    [data.accounts, data.transactions],
  )

  const lowStock = data.catalog.filter((item) => item.stock !== null && Number(item.stock) <= Number(item.minStock || 0))
  const profile = profileOptions.find((item) => item.id === data.user.profile) || profileOptions[4]
  const activeWorkspaceId = data.meta?.workspaceId || (firebaseUser ? workspaceIdFor(firebaseUser.uid) : 'local-dev')

  function completeOnboarding(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const profileId = form.get('profile')
    const businessName = form.get('businessName') || 'Meu negócio'
    const name = form.get('name') || 'Você'
    const businessBalance = parseAmountInput(form.get('businessBalance'))
    const personalBalance = parseAmountInput(form.get('personalBalance'))
    const controlsStock = form.get('controlsStock') === 'yes'
    const goalTitle = String(form.get('goalTitle') || '').trim()
    const goalTarget = parseAmountInput(form.get('goalTarget'))
    const catalog = buildCatalog(profileId).map((item) =>
      controlsStock || item.type === 'service' || item.type === 'project'
        ? item
        : { ...item, stock: null, minStock: null },
    )
    setData({
      ...starterData,
      onboarded: true,
      user: { name, businessName, profile: profileId },
      accounts: starterData.accounts.map((account) => {
        if (account.id === 'business-cash') return { ...account, balance: businessBalance }
        if (account.id === 'personal-wallet') return { ...account, balance: personalBalance }
        return account
      }),
      catalog,
      goals: goalTitle && goalTarget
        ? [{ id: createId(), title: goalTitle, target: goalTarget, current: 0, due: today(), scope: 'business' }]
        : [],
    })
  }

  async function parseQuickText() {
    const parsed = await parseEntry({ text: quickText, data, defaultScope })
    setDrafts(parsed)
    if (parsed.length) setQuickText('')
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setQuickText('Meu navegador não liberou voz aqui. Digite: vendi 3 serviços por 240 e gastei 35 com material')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onstart = () => setIsListening(true)
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognition.onresult = async (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
      const parsed = await parseEntry({ text: transcript, data, defaultScope })
      setQuickText(transcript)
      setDrafts(parsed)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  function confirmDraft(draft) {
    setData((current) => {
      const transaction = { ...draft, id: createId(), source: 'confirmed' }
      const nextCatalog = current.catalog.map((item) => {
        const sameItem = normalizeText(item.name) === normalizeText(draft.itemName || draft.title)
        if (!sameItem || item.stock === null) return item
        if (draft.type === 'income' && draft.kind === 'sale') {
          return { ...item, stock: Math.max(0, Number(item.stock) - Number(draft.quantity || 1)) }
        }
        if (draft.type === 'expense' && draft.kind === 'purchase') {
          return { ...item, stock: Number(item.stock) + Number(draft.quantity || 1) }
        }
        return item
      })
      return {
        ...current,
        catalog: nextCatalog,
        transactions: [transaction, ...current.transactions],
      }
    })
    setDrafts((current) => current.filter((item) => item.id !== draft.id))
  }

  function confirmAllDrafts() {
    const readyDrafts = drafts.filter((draft) => !draftNeedsReview(draft))
    if (!readyDrafts.length) return
    setData((current) => {
      const transactionsToAdd = readyDrafts.map((draft) => ({ ...draft, id: createId(), source: 'confirmed' }))
      const nextCatalog = current.catalog.map((item) => {
        const itemDrafts = readyDrafts.filter((draft) => normalizeText(item.name) === normalizeText(draft.itemName || draft.title))
        if (!itemDrafts.length || item.stock === null) return item
        const movement = itemDrafts.reduce((acc, draft) => {
          if (draft.type === 'income' && draft.kind === 'sale') return acc - Number(draft.quantity || 1)
          if (draft.type === 'expense' && draft.kind === 'purchase') return acc + Number(draft.quantity || 1)
          return acc
        }, 0)
        return { ...item, stock: Math.max(0, Number(item.stock || 0) + movement) }
      })
      return {
        ...current,
        catalog: nextCatalog,
        transactions: [...transactionsToAdd, ...current.transactions],
      }
    })
    setDrafts((current) => current.filter((draft) => draftNeedsReview(draft)))
  }

  function saveManual(event) {
    event.preventDefault()
    if (!manual.title || !manual.amount) return
    const item = {
      id: createId(),
      type: manual.type,
      scope: manual.scope,
      kind: manual.type === 'income' ? 'sale' : 'expense',
      title: manual.title,
      category: manual.category,
      amount: parseAmountInput(manual.amount),
      date: manual.date || today(),
      accountId: manual.accountId || getDefaultAccountId(data.accounts, manual.scope),
      quantity: 1,
      itemName: manual.title,
      note: 'Lançado manualmente',
      source: 'manual',
    }
    setData((current) => ({ ...current, transactions: [item, ...current.transactions] }))
    setManual({ ...manual, title: '', amount: '', accountId: '', date: today() })
  }

  function updateTransaction(id, patch) {
    setData((current) => ({
      ...current,
      transactions: current.transactions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  function deleteTransaction(id) {
    setData((current) => ({
      ...current,
      transactions: current.transactions.filter((item) => item.id !== id),
    }))
  }

  function saveGoal(event) {
    event.preventDefault()
    if (!newGoal.title || !newGoal.target) return
    setData((current) => ({
      ...current,
      goals: [
        ...current.goals,
        {
          id: createId(),
          title: newGoal.title,
          target: parseAmountInput(newGoal.target),
          current: 0,
          due: newGoal.due || today(),
          scope: defaultScope,
        },
      ],
    }))
    setNewGoal({ title: '', target: '', due: '' })
  }

  function saveCatalogItem(event) {
    event.preventDefault()
    if (!newCatalogItem.name) return
    setData((current) => ({
      ...current,
      catalog: [
        ...current.catalog,
        {
          id: createId(),
          name: newCatalogItem.name,
          type: newCatalogItem.type,
          price: parseAmountInput(newCatalogItem.price),
          cost: parseAmountInput(newCatalogItem.cost),
          stock: newCatalogItem.type === 'service' || newCatalogItem.type === 'project' ? null : parseAmountInput(newCatalogItem.stock),
          minStock: newCatalogItem.type === 'service' || newCatalogItem.type === 'project' ? null : parseAmountInput(newCatalogItem.minStock),
        },
      ],
    }))
    setNewCatalogItem({ name: '', type: 'service', price: '', cost: '', stock: '', minStock: '' })
  }

  function updateCatalogItem(id, patch) {
    setData((current) => ({
      ...current,
      catalog: current.catalog.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  function deleteCatalogItem(id) {
    setData((current) => ({
      ...current,
      catalog: current.catalog.filter((item) => item.id !== id),
    }))
  }

  function contributeToGoal(goal) {
    const amount = parseAmountInput(goalDrafts[goal.id])
    if (!amount) return
    setData((current) => ({
      ...current,
      goals: current.goals.map((item) =>
        item.id === goal.id ? { ...item, current: Math.min(Number(item.target || 0), Number(item.current || 0) + amount) } : item,
      ),
      transactions: [
        {
          id: createId(),
          type: 'transfer',
          scope: goal.scope,
          kind: 'goal',
          title: `Aporte para ${goal.title}`,
          category: 'Reserva',
          amount,
          date: today(),
          accountId: getDefaultAccountId(current.accounts, goal.scope),
          quantity: 1,
          itemName: goal.title,
          note: 'Aporte registrado na meta',
          source: 'goal',
        },
        ...current.transactions,
      ],
    }))
    setGoalDrafts((current) => ({ ...current, [goal.id]: '' }))
  }

  function saveAccount(event) {
    event.preventDefault()
    if (!newAccount.name) return
    setData((current) => ({
      ...current,
      accounts: [
        ...current.accounts,
        {
          id: createId(),
          name: newAccount.name,
          scope: newAccount.scope,
          type: newAccount.type,
          balance: parseAmountInput(newAccount.balance),
        },
      ],
    }))
    setNewAccount({ name: '', scope: 'business', type: 'cash', balance: '' })
  }

  function updateAccount(id, patch) {
    setData((current) => ({
      ...current,
      accounts: current.accounts.map((account) => (account.id === id ? { ...account, ...patch } : account)),
    }))
  }

  function deleteAccount(id) {
    setData((current) => {
      const isUsed = current.transactions.some((item) => item.accountId === id)
      if (isUsed) {
        window.alert('Essa conta tem lançamentos. Mova ou edite os lançamentos antes de excluir.')
        return current
      }
      return {
        ...current,
        accounts: current.accounts.filter((account) => account.id !== id),
      }
    })
  }

  function saveClient(event) {
    event.preventDefault()
    if (!newClient.name) return
    setData((current) => ({
      ...current,
      clients: [
        ...current.clients,
        {
          id: createId(),
          name: newClient.name,
          phone: newClient.phone,
          receivable: parseAmountInput(newClient.receivable),
          due: newClient.due || today(),
          status: parseAmountInput(newClient.receivable) > 0 ? 'pending' : 'active',
          notes: newClient.notes,
        },
      ],
    }))
    setNewClient({ name: '', phone: '', receivable: '', due: '', notes: '' })
  }

  function receiveClient(client) {
    setData((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? { ...item, receivable: 0, status: 'paid' } : item,
      ),
      transactions: [
        {
          id: createId(),
          type: 'income',
          scope: 'business',
          kind: 'receivable',
          title: `Recebido de ${client.name}`,
          category: 'Recebimento',
          amount: Number(client.receivable || 0),
          date: today(),
          accountId: 'business-cash',
          quantity: 1,
          itemName: client.name,
          note: 'Recebimento marcado em clientes',
          source: 'client',
        },
        ...current.transactions,
      ],
    }))
  }

  function updateClient(id, patch) {
    setData((current) => ({
      ...current,
      clients: current.clients.map((client) => (client.id === id ? { ...client, ...patch } : client)),
    }))
  }

  function deleteClient(id) {
    setData((current) => ({
      ...current,
      clients: current.clients.filter((client) => client.id !== id),
    }))
  }

  function saveBill(event) {
    event.preventDefault()
    if (!newBill.title || !newBill.amount) return
    setData((current) => ({
      ...current,
      bills: [
        ...current.bills,
        {
          id: createId(),
          title: newBill.title,
          type: newBill.type,
          scope: newBill.scope,
          amount: parseAmountInput(newBill.amount),
          due: newBill.due || today(),
          status: 'open',
          category: newBill.category,
        },
      ],
    }))
    setNewBill({ title: '', type: 'payable', scope: 'business', amount: '', due: '', category: 'Conta fixa' })
  }

  function payBill(bill) {
    setData((current) => ({
      ...current,
      bills: current.bills.map((item) => (item.id === bill.id ? { ...item, status: 'paid', paidAt: today() } : item)),
      transactions: [
        {
          id: createId(),
          type: bill.type === 'receivable' ? 'income' : 'expense',
          scope: bill.scope,
          kind: bill.type,
          title: bill.title,
          category: bill.category,
          amount: Number(bill.amount || 0),
          date: today(),
          accountId: getDefaultAccountId(current.accounts, bill.scope),
          quantity: 1,
          itemName: bill.title,
          note: bill.type === 'receivable' ? 'Conta recebida' : 'Conta paga',
          source: 'bill',
        },
        ...current.transactions,
      ],
    }))
  }

  function deleteBill(id) {
    setData((current) => ({
      ...current,
      bills: current.bills.filter((bill) => bill.id !== id),
    }))
  }

  function updateBill(id, patch) {
    setData((current) => ({
      ...current,
      bills: current.bills.map((bill) => (bill.id === id ? { ...bill, ...patch } : bill)),
    }))
  }

  async function saveSale(event) {
    event.preventDefault()
    const item = data.catalog.find((catalogItem) => catalogItem.id === newSale.itemId) || data.catalog[0]
    const quantity = parseAmountInput(newSale.quantity || 1)
    const unitPrice = parseAmountInput(newSale.unitPrice || item?.price || 0)
    const total = quantity * unitPrice
    if (!newSale.clientName || !item || !total) return
    if (item.stock !== null && Number(item.stock || 0) < quantity) {
      const confirmed = window.confirm('O estoque atual e menor que a quantidade vendida. Salvar mesmo assim e zerar o estoque?')
      if (!confirmed) return
    }
    const nextState = await createSaleOperation({ data, sale: newSale }).catch((error) => {
      window.alert(`Não consegui salvar a venda: ${error.message}`)
      return null
    })
    if (!nextState) return
    setData(migrateData(nextState))

    setNewSale({
      clientName: '',
      itemId: item.id,
      quantity: '1',
      unitPrice: item.price || '',
      status: 'paid',
      date: today(),
      due: today(),
      notes: '',
    })
  }

  async function deleteSale(id) {
    const confirmed = window.confirm('Cancelar esta venda e desfazer financeiro, estoque e contas vinculadas?')
    if (!confirmed) return
    const nextState = await cancelSaleService({ data, saleId: id }).catch((error) => {
      window.alert(`Não consegui cancelar a venda: ${error.message}`)
      return null
    })
    if (nextState) setData(migrateData(nextState))
  }

  async function savePurchase(event) {
    event.preventDefault()
    const item = data.catalog.find((catalogItem) => catalogItem.id === newPurchase.itemId) || data.catalog[0]
    const quantity = parseAmountInput(newPurchase.quantity || 1)
    const unitCost = parseAmountInput(newPurchase.unitCost || item?.cost || 0)
    const total = quantity * unitCost
    if (!newPurchase.supplierName || !item || !total) return
    const nextState = await createPurchaseOperation({ data, purchase: newPurchase }).catch((error) => {
      window.alert(`Não consegui salvar a compra: ${error.message}`)
      return null
    })
    if (!nextState) return
    setData(migrateData(nextState))

    setNewPurchase({
      supplierName: '',
      itemId: item.id,
      quantity: '1',
      unitCost: unitCost || '',
      status: 'paid',
      date: today(),
      due: today(),
      notes: '',
    })
  }

  async function deletePurchase(id) {
    const confirmed = window.confirm('Cancelar esta compra e desfazer financeiro, estoque e contas vinculadas?')
    if (!confirmed) return
    const nextState = await cancelPurchaseService({ data, purchaseId: id }).catch((error) => {
      window.alert(`Não consegui cancelar a compra: ${error.message}`)
      return null
    })
    if (nextState) setData(migrateData(nextState))
  }

  function exportBackup() {
    const payload = JSON.stringify(data, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `norte-backup-${today()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function importBackup(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        setData(migrateData(JSON.parse(reader.result)))
      } catch {
        window.alert('Nao consegui importar esse arquivo.')
      }
    }
    reader.readAsText(file)
  }

  function resetAppData() {
    const confirmed = window.confirm('Isso reinicia os dados salvos na API local. Continuar?')
    if (confirmed) {
      setData(starterData)
    }
  }

  if (productionNeedsFirebase) {
    return <FirebaseRequiredScreen />
  }

  if (firebaseEnabled && authReady && !firebaseUser) {
    return <AuthScreen />
  }

  if (!data) {
    return (
      <main className="loading-screen">
        <Brand />
        <p>{firebaseEnabled && !authReady ? 'Conectando ao Firebase...' : 'Carregando seu app financeiro...'}</p>
      </main>
    )
  }

  if (!data.onboarded) {
    return <Onboarding onComplete={completeOnboarding} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav-list" aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={`nav-button ${active === item.id ? 'active' : ''}`}
                type="button"
                onClick={() => setActive(item.id)}
                title={item.label}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{profile.label}</p>
            <h1>{data.user.businessName}</h1>
          </div>
          <div className="topbar-actions">
            <div className="tenant-chip" title={activeWorkspaceId}>
              <span>{firebaseEnabled ? 'Conta autenticada' : 'Modo local'}</span>
              <strong>{firebaseUser?.email || 'Sem Firebase'}</strong>
              <small>{activeWorkspaceId}</small>
            </div>
            <span className={`data-status ${dataStatus}`}>
              {firebaseEnabled ? (dataStatus === 'ready' ? 'Salvando no Firebase' : 'Firebase offline') : dataStatus === 'ready' ? 'Salvando na API' : 'API offline'}
            </span>
            {firebaseEnabled && (
              <button className="secondary-action" type="button" onClick={logoutFirebase}>
                Sair
              </button>
            )}
            <div className="scope-toggle" aria-label="Escopo padrão">
              <button className={defaultScope === 'business' ? 'selected' : ''} type="button" onClick={() => setDefaultScope('business')}>
                Negócio
              </button>
              <button className={defaultScope === 'personal' ? 'selected' : ''} type="button" onClick={() => setDefaultScope('personal')}>
                Pessoal
              </button>
            </div>
          </div>
        </header>

        {active === 'today' && (
          <TodayView
            totals={totals}
            transactions={transactions}
            accountBalances={accountBalances}
            lowStock={lowStock}
            goals={data.goals}
            bills={data.bills}
            clients={data.clients}
            onGoLaunch={() => setActive('launch')}
            onNavigate={setActive}
          />
        )}

        {active === 'launch' && (
          <LaunchView
            quickText={quickText}
            setQuickText={setQuickText}
            parseQuickText={parseQuickText}
            startVoice={startVoice}
            isListening={isListening}
            drafts={drafts}
            setDrafts={setDrafts}
            confirmDraft={confirmDraft}
            confirmAllDrafts={confirmAllDrafts}
            manual={manual}
            setManual={setManual}
            saveManual={saveManual}
            accounts={data.accounts}
            transactions={transactions}
            updateTransaction={updateTransaction}
            deleteTransaction={deleteTransaction}
          />
        )}

        {active === 'assistant' && (
          <AssistantView totals={totals} accountBalances={accountBalances} lowStock={lowStock} />
        )}

        {active === 'sales' && (
          <SalesView
            sales={data.sales || []}
            clients={data.clients}
            catalog={data.catalog}
            newSale={newSale}
            setNewSale={setNewSale}
            saveSale={saveSale}
            deleteSale={deleteSale}
          />
        )}

        {active === 'purchases' && (
          <PurchasesView
            purchases={data.purchases || []}
            suppliers={data.suppliers || []}
            catalog={data.catalog}
            newPurchase={newPurchase}
            setNewPurchase={setNewPurchase}
            savePurchase={savePurchase}
            deletePurchase={deletePurchase}
          />
        )}

        {active === 'business' && (
          <BusinessView
            data={data}
            profile={profile}
            totals={totals}
            lowStock={lowStock}
            newCatalogItem={newCatalogItem}
            setNewCatalogItem={setNewCatalogItem}
            saveCatalogItem={saveCatalogItem}
            updateCatalogItem={updateCatalogItem}
            deleteCatalogItem={deleteCatalogItem}
          />
        )}

        {active === 'clients' && (
          <ClientsView
            clients={data.clients}
            newClient={newClient}
            setNewClient={setNewClient}
            saveClient={saveClient}
            receiveClient={receiveClient}
            updateClient={updateClient}
            deleteClient={deleteClient}
          />
        )}

        {active === 'bills' && (
          <BillsView
            bills={data.bills}
            totals={totals}
            newBill={newBill}
            setNewBill={setNewBill}
            saveBill={saveBill}
            payBill={payBill}
            deleteBill={deleteBill}
            updateBill={updateBill}
          />
        )}

        {active === 'personal' && (
          <PersonalView
            totals={totals}
            accountBalances={accountBalances}
            transactions={transactions}
            newAccount={newAccount}
            setNewAccount={setNewAccount}
            saveAccount={saveAccount}
            updateAccount={updateAccount}
            deleteAccount={deleteAccount}
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
            accounts={data.accounts}
          />
        )}

        {active === 'reports' && (
          <ReportsView
            data={data}
            totals={totals}
            accountBalances={accountBalances}
            lowStock={lowStock}
          />
        )}

        {active === 'goals' && (
          <GoalsView
            goals={data.goals}
            newGoal={newGoal}
            setNewGoal={setNewGoal}
            saveGoal={saveGoal}
            goalDrafts={goalDrafts}
            setGoalDrafts={setGoalDrafts}
            contributeToGoal={contributeToGoal}
          />
        )}

        {active === 'settings' && (
          <SettingsView data={data} exportBackup={exportBackup} importBackup={importBackup} resetAppData={resetAppData} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Navegação inferior">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={active === item.id ? 'active' : ''} type="button" onClick={() => setActive(item.id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Sparkles size={20} />
      </div>
      <div>
        <strong>Norte</strong>
        <span>finanças claras</span>
      </div>
    </div>
  )
}

function FirebaseRequiredScreen() {
  return (
    <main className="auth-screen">
      <section className="welcome-band">
        <Brand />
        <div className="welcome-copy">
          <p className="eyebrow">Configuração obrigatória</p>
          <h1>O Norte precisa do Firebase para rodar em produção.</h1>
          <p>Configure as variáveis `VITE_FIREBASE_*` no Vercel para ativar login, tenant e banco real por usuário.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div>
          <p className="eyebrow">SaaS protegido</p>
          <h2>Sem Firebase, sem dados reais.</h2>
        </div>
        <p className="form-error">
          Esta tela bloqueia produção sem autenticação para evitar que usuários compartilhem dados em modo local.
        </p>
      </section>
    </main>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password)
      } else {
        await registerWithEmail(email, password)
      }
    } catch (authError) {
      setError(authError.message || 'Não consegui entrar agora.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="welcome-band">
        <Brand />
        <div className="welcome-copy">
          <p className="eyebrow">Conta Norte</p>
          <h1>Entre para acessar suas finanças com segurança.</h1>
          <p>Seus dados ficam separados por usuário no Firebase Authentication e Firestore.</p>
        </div>
      </section>
      <form className="auth-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">{mode === 'login' ? 'Entrar' : 'Criar conta'}</p>
          <h2>{mode === 'login' ? 'Acesse sua conta' : 'Comece agora'}</h2>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" type="submit" disabled={loading}>
          <Check size={18} />
          {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <button className="text-action" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Criar uma nova conta' : 'Já tenho conta'}
        </button>
      </form>
    </main>
  )
}

function Onboarding({ onComplete }) {
  const [selected, setSelected] = useState('services')

  return (
    <main className="onboarding">
      <section className="welcome-band">
        <Brand />
        <div className="welcome-copy">
          <p className="eyebrow">Norte financeiro</p>
          <h1>Fale o que aconteceu. O app organiza dinheiro, negócio e metas.</h1>
          <p>
            Controle pessoal, negócio, registro inteligente, produtos, serviços, clientes, contas e decisões do dia em um só lugar.
          </p>
        </div>
      </section>

      <form className="setup-panel" onSubmit={onComplete}>
        <div className="form-grid two">
          <label>
            Seu nome
            <input name="name" placeholder="Ex: Ana" />
          </label>
          <label>
            Nome do negócio
            <input name="businessName" placeholder="Ex: Studio Ana" />
          </label>
        </div>

        <div className="form-grid two">
          <label>
            Caixa inicial do negócio
            <input name="businessBalance" placeholder="0,00" inputMode="decimal" />
          </label>
          <label>
            Dinheiro pessoal inicial
            <input name="personalBalance" placeholder="0,00" inputMode="decimal" />
          </label>
        </div>

        <fieldset>
          <legend>Operação inicial</legend>
          <div className="segmented wide stock-choice">
            <label className="radio-segment">
              <input type="radio" name="controlsStock" value="yes" defaultChecked />
              Controlo estoque
            </label>
            <label className="radio-segment">
              <input type="radio" name="controlsStock" value="no" />
              Não controlo estoque
            </label>
          </div>
        </fieldset>

        <div className="form-grid two">
          <label>
            Primeira meta
            <input name="goalTitle" placeholder="Ex: Reserva do negócio" />
          </label>
          <label>
            Valor da meta
            <input name="goalTarget" placeholder="3000" inputMode="decimal" />
          </label>
        </div>

        <fieldset>
          <legend>Como você ganha dinheiro?</legend>
          <div className="profile-grid">
            {profileOptions.map((profile) => (
              <label key={profile.id} className={`profile-card ${selected === profile.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="profile"
                  value={profile.id}
                  checked={selected === profile.id}
                  onChange={() => setSelected(profile.id)}
                />
                <span className="profile-title">{profile.label}</span>
                <span>{profile.example}</span>
                <small>{profile.focus.join(' • ')}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <button className="primary-action" type="submit">
          <Check size={18} />
          Entrar no app
        </button>
      </form>
    </main>
  )
}

function TodayView({ totals, transactions, accountBalances, lowStock, goals, bills, clients, onGoLaunch, onNavigate }) {
  const profit = totals.todayIncome - totals.todayExpense
  const nextGoal = goals[0]
  const businessBalance = getBusinessBalance(accountBalances)
  const todayDate = today()
  const openBills = bills.filter((bill) => bill.status !== 'paid')
  const overdueBills = openBills.filter((bill) => bill.due < todayDate)
  const dueTodayBills = openBills.filter((bill) => bill.due === todayDate)
  const pendingClients = clients.filter((client) => Number(client.receivable || 0) > 0)
  const priorities = [
    ...overdueBills.slice(0, 2).map((bill) => ({
      tone: 'danger',
      title: `${bill.type === 'payable' ? 'Pagar vencido' : 'Receber vencido'}: ${bill.title}`,
      detail: `${money(bill.amount)} venceu em ${new Date(`${bill.due}T12:00:00`).toLocaleDateString('pt-BR')}`,
      action: 'Contas',
      target: 'bills',
    })),
    ...dueTodayBills.slice(0, 2).map((bill) => ({
      tone: 'warning',
      title: `${bill.type === 'payable' ? 'Pagar hoje' : 'Receber hoje'}: ${bill.title}`,
      detail: `${money(bill.amount)} vence hoje`,
      action: 'Contas',
      target: 'bills',
    })),
    ...lowStock.slice(0, 2).map((item) => ({
      tone: 'warning',
      title: `${item.name} em estoque baixo`,
      detail: `Atual: ${number(item.stock)} • mínimo: ${number(item.minStock)}`,
      action: 'Comprar',
      target: 'purchases',
    })),
    ...pendingClients.slice(0, 2).map((client) => ({
      tone: 'info',
      title: `${client.name} tem valor em aberto`,
      detail: `${money(client.receivable)} para receber`,
      action: 'Clientes',
      target: 'clients',
    })),
  ].slice(0, 5)
  const dailySummary = `Resumo de hoje: entrou ${money(totals.todayIncome)}, saiu ${money(totals.todayExpense)} e o resultado estimado foi ${money(profit)}. Caixa do negócio: ${money(businessBalance)}.`

  function copySummary() {
    navigator.clipboard?.writeText(dailySummary)
  }

  return (
    <section className="screen">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Resumo de hoje</p>
          <h2>{profit >= 0 ? 'O dia está sob controle.' : 'Hora de segurar os gastos.'}</h2>
          <p>
            Entrou {money(totals.todayIncome)}, saiu {money(totals.todayExpense)} e o resultado estimado ficou em{' '}
            <strong>{money(profit)}</strong>.
          </p>
        </div>
        <button className="primary-action" type="button" onClick={onGoLaunch}>
          <Mic size={18} />
          Falar lançamento
        </button>
        <button className="secondary-action" type="button" onClick={copySummary}>
          <FileText size={18} />
          Copiar resumo
        </button>
      </div>

      <div className="metric-grid">
        <Metric title="Entradas hoje" value={money(totals.todayIncome)} icon={ArrowUpRight} tone="green" />
        <Metric title="Saídas hoje" value={money(totals.todayExpense)} icon={ArrowDownRight} tone="red" />
        <Metric title="Caixa do negócio" value={money(businessBalance)} icon={Store} tone="blue" />
        <Metric title="A receber" value={money(totals.receivable)} icon={Users} tone="amber" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Precisa de atenção</h3>
            <AlertCircle size={18} />
          </div>
          <div className="priority-list">
            {priorities.length ? (
              priorities.map((item) => (
                <article className={`priority-item ${item.tone}`} key={`${item.title}-${item.detail}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <button className="mini-action" type="button" onClick={() => onNavigate(item.target)}>
                    {item.action}
                  </button>
                </article>
              ))
            ) : (
              <p className="empty-state">Nada urgente agora. Continue registrando os movimentos do dia.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Próxima ação</h3>
            <Sparkles size={18} />
          </div>
          <ActionInsight lowStock={lowStock} totals={totals} nextGoal={nextGoal} />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Últimos movimentos</h3>
            <ReceiptText size={18} />
          </div>
          <TransactionList items={transactions.slice(0, 5)} compact />
        </section>
      </div>
    </section>
  )
}

function ActionInsight({ lowStock, totals, nextGoal }) {
  if (lowStock.length) {
    return (
      <div className="insight warning">
        <AlertCircle size={20} />
        <div>
          <strong>{lowStock[0].name} está perto de acabar.</strong>
          <span>Revise a compra antes do próximo pico de vendas ou atendimento.</span>
        </div>
      </div>
    )
  }

  if (totals.todayIncome === 0) {
    return (
      <div className="insight">
        <Mic size={20} />
        <div>
          <strong>Registre o primeiro movimento do dia.</strong>
          <span>Você pode falar: “recebi 120 de cliente e gastei 35 com material”.</span>
        </div>
      </div>
    )
  }

  if (nextGoal) {
    const remaining = Math.max(0, nextGoal.target - nextGoal.current)
    return (
      <div className="insight success">
        <Target size={20} />
        <div>
          <strong>Faltam {money(remaining)} para {nextGoal.title}.</strong>
          <span>Separar parte das entradas de hoje aproxima essa meta sem esforço.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="insight">
      <TrendingUp size={20} />
      <div>
        <strong>Continue registrando em poucos segundos.</strong>
        <span>Com alguns dias de uso, o resumo semanal fica bem mais inteligente.</span>
      </div>
    </div>
  )
}

function LaunchView({
  quickText,
  setQuickText,
  parseQuickText,
  startVoice,
  isListening,
  drafts,
  setDrafts,
  confirmDraft,
  confirmAllDrafts,
  manual,
  setManual,
  saveManual,
  accounts,
  transactions,
  updateTransaction,
  deleteTransaction,
}) {
  const readyCount = drafts.filter((draft) => !draftNeedsReview(draft)).length
  const reviewCount = drafts.length - readyCount
  const parsedIncome = drafts.filter((draft) => draft.type === 'income').reduce((acc, draft) => acc + Number(draft.amount || 0), 0)
  const parsedExpense = drafts.filter((draft) => draft.type === 'expense').reduce((acc, draft) => acc + Number(draft.amount || 0), 0)

  const updateDraft = (id, patch) => {
    setDrafts((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Lançamento inteligente</p>
          <h2>Digite ou fale naturalmente</h2>
        </div>
      </div>

      <section className="quick-capture">
        <textarea
          value={quickText}
          onChange={(event) => setQuickText(event.target.value)}
          placeholder="Ex: vendi 3 atendimentos por 240, comprei material por 35 e retirei 80 para uso pessoal"
        />
        <div className="capture-actions">
          <button className={`icon-action ${isListening ? 'recording' : ''}`} type="button" onClick={startVoice} title="Gravar por voz">
            <Mic size={20} />
          </button>
          <button className="primary-action" type="button" onClick={parseQuickText}>
            <Send size={18} />
            Interpretar
          </button>
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h3>Confirmar antes de salvar</h3>
            <button className="secondary-action" type="button" onClick={confirmAllDrafts} disabled={!readyCount}>
              <Check size={18} />
              Confirmar prontos
            </button>
          </div>
          <div className="draft-summary">
            <span>{readyCount} prontos</span>
            <span>{reviewCount} para revisar</span>
            <span>Entradas {money(parsedIncome)}</span>
            <span>Saídas {money(parsedExpense)}</span>
          </div>
          <div className="draft-list">
            {drafts.map((draft) => (
              <article className={`draft-item ${draftNeedsReview(draft) ? 'needs-review' : ''}`} key={draft.id}>
                <div className="draft-edit">
                  <span className={`pill ${draft.type}`}>{draft.type === 'income' ? 'Entrada' : draft.type === 'expense' ? 'Saída' : 'Transferência'}</span>
                  <div className="form-grid">
                    <label>
                      Descrição
                      <input value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value, itemName: event.target.value })} />
                    </label>
                    <label>
                      Valor
                      <input value={draft.amount} onChange={(event) => updateDraft(draft.id, { amount: Number(event.target.value || 0) })} inputMode="decimal" />
                    </label>
                    <label>
                      Área
                      <select
                        value={draft.scope}
                        onChange={(event) => {
                          const scope = event.target.value
                          updateDraft(draft.id, { scope, accountId: getDefaultAccountId(accounts, scope) })
                        }}
                      >
                        <option value="business">Negócio</option>
                        <option value="personal">Pessoal</option>
                      </select>
                    </label>
                    <label>
                      Conta
                      <select value={draft.accountId} onChange={(event) => updateDraft(draft.id, { accountId: event.target.value })}>
                        {getAccountOptions(accounts, draft.scope).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Categoria
                      <select value={draft.category} onChange={(event) => updateDraft(draft.id, { category: event.target.value })}>
                        {(draft.type === 'income' ? categories.income : draft.type === 'expense' ? categories.expense : categories.transfer).map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantidade
                      <input value={draft.quantity} onChange={(event) => updateDraft(draft.id, { quantity: Number(event.target.value || 0) })} inputMode="decimal" />
                    </label>
                  </div>
                </div>
                <strong>{money(draft.amount)}</strong>
                <div className="row-actions">
                  <button type="button" onClick={() => confirmDraft(draft)} title="Confirmar">
                    <Check size={18} />
                  </button>
                  <button type="button" onClick={() => setDrafts((items) => items.filter((item) => item.id !== draft.id))} title="Descartar">
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h3>Lançar manualmente</h3>
          <ReceiptText size={18} />
        </div>
        <form className="manual-form" onSubmit={saveManual}>
          <div className="segmented">
            {['income', 'expense'].map((type) => (
              <button key={type} className={manual.type === type ? 'selected' : ''} type="button" onClick={() => setManual({ ...manual, type })}>
                {type === 'income' ? 'Entrada' : 'Saída'}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Descrição
              <input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="Ex: Cliente Ana" />
            </label>
            <label>
              Valor
              <input
                value={manual.amount}
                onChange={(event) => setManual({ ...manual, amount: event.target.value })}
                placeholder="0,00"
                inputMode="decimal"
              />
            </label>
            <label>
              Área
              <select value={manual.scope} onChange={(event) => setManual({ ...manual, scope: event.target.value, accountId: '' })}>
                <option value="business">Negócio</option>
                <option value="personal">Pessoal</option>
              </select>
            </label>
            <label>
              Conta
              <select value={manual.accountId} onChange={(event) => setManual({ ...manual, accountId: event.target.value })}>
                <option value="">Conta padrão</option>
                {getAccountOptions(accounts, manual.scope).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoria
              <select value={manual.category} onChange={(event) => setManual({ ...manual, category: event.target.value })}>
                {(manual.type === 'income' ? categories.income : categories.expense).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input type="date" value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} />
            </label>
          </div>
          <button className="primary-action" type="submit">
            <Plus size={18} />
            Salvar lançamento
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Movimentos recentes</h3>
          <ReceiptText size={18} />
        </div>
        <TransactionList items={transactions.slice(0, 6)} accounts={accounts} onUpdate={updateTransaction} onDelete={deleteTransaction} />
      </section>
    </section>
  )
}

function AssistantView({ totals, accountBalances, lowStock }) {
  const businessBalance = getBusinessBalance(accountBalances)
  const personalBalance = getPersonalBalance(accountBalances)
  const openPayables = totals.billsPayable
  const openReceivables = totals.billsReceivable + totals.receivable
  const estimatedProfit = totals.businessIncome - totals.businessExpense
  const [decision, setDecision] = useState('withdraw')
  const [inputs, setInputs] = useState({ amount: '500', days: '7', cost: '25', margin: '35', fee: '5' })

  const amount = Number(inputs.amount || 0)
  const days = Math.max(1, Number(inputs.days || 1))
  const cost = Number(inputs.cost || 0)
  const margin = Number(inputs.margin || 0)
  const fee = Number(inputs.fee || 0)
  const safeBusinessCash = Math.max(0, businessBalance + openReceivables - openPayables)
  const suggestedWithdrawal = Math.max(0, safeBusinessCash * 0.35)
  const priceBase = margin >= 100 ? 0 : cost / Math.max(0.01, 1 - margin / 100)
  const priceWithFee = priceBase / Math.max(0.01, 1 - fee / 100)

  const result = {
    withdraw: {
      title: amount <= suggestedWithdrawal ? 'Retirada parece segura.' : 'Retirada merece cuidado.',
      text:
        amount <= suggestedWithdrawal
          ? `Depois de contas e recebimentos, o limite confortável calculado é ${money(suggestedWithdrawal)}.`
          : `O limite confortável calculado é ${money(suggestedWithdrawal)}. Se retirar ${money(amount)}, acompanhe as contas abertas.`,
      action: `Caixa do negócio: ${money(businessBalance)} • contas a pagar: ${money(openPayables)}.`,
    },
    buy: {
      title: businessBalance - amount >= openPayables ? 'A compra cabe no caixa.' : 'A compra pode apertar o caixa.',
      text:
        businessBalance - amount >= openPayables
          ? `Após comprar, ainda ficariam ${money(businessBalance - amount)} antes dos próximos recebimentos.`
          : `Após comprar, ficariam ${money(businessBalance - amount)} para cobrir ${money(openPayables)} em contas abertas.`,
      action: openReceivables ? `Há ${money(openReceivables)} previsto para receber.` : 'Sem recebimentos em aberto cadastrados.',
    },
    sales: {
      title: `Meta diária: ${money(amount / days)}.`,
      text: `Para juntar ou faturar ${money(amount)} em ${days} dias, acompanhe esse alvo todos os dias.`,
      action: `Lucro estimado registrado até agora: ${money(estimatedProfit)}.`,
    },
    price: {
      title: `Preço sugerido: ${money(priceWithFee)}.`,
      text: `Com custo de ${money(cost)}, margem desejada de ${number(margin)}% e taxa de ${number(fee)}%, esse é o preço mínimo sugerido.`,
      action: `Lucro estimado por unidade: ${money(priceWithFee - cost - priceWithFee * (fee / 100))}.`,
    },
  }[decision]

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Assistente de decisão</p>
          <h2>Respostas práticas para hoje</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Caixa negócio" value={money(businessBalance)} icon={Store} tone="blue" />
        <Metric title="Caixa pessoal" value={money(personalBalance)} icon={Wallet} tone="blue" />
        <Metric title="A pagar" value={money(openPayables)} icon={ArrowDownRight} tone="red" />
        <Metric title="A receber" value={money(openReceivables)} icon={ArrowUpRight} tone="green" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Tomar decisão</h3>
            <Sparkles size={18} />
          </div>
          <div className="segmented wide">
            <button className={decision === 'withdraw' ? 'selected' : ''} type="button" onClick={() => setDecision('withdraw')}>
              Retirada
            </button>
            <button className={decision === 'buy' ? 'selected' : ''} type="button" onClick={() => setDecision('buy')}>
              Compra
            </button>
            <button className={decision === 'sales' ? 'selected' : ''} type="button" onClick={() => setDecision('sales')}>
              Meta
            </button>
            <button className={decision === 'price' ? 'selected' : ''} type="button" onClick={() => setDecision('price')}>
              Preço
            </button>
          </div>

          <div className="form-grid decision-inputs">
            {decision !== 'price' && (
              <label>
                Valor
                <input value={inputs.amount} onChange={(event) => setInputs({ ...inputs, amount: event.target.value })} inputMode="decimal" />
              </label>
            )}
            {decision === 'sales' && (
              <label>
                Dias
                <input value={inputs.days} onChange={(event) => setInputs({ ...inputs, days: event.target.value })} inputMode="numeric" />
              </label>
            )}
            {decision === 'price' && (
              <>
                <label>
                  Custo
                  <input value={inputs.cost} onChange={(event) => setInputs({ ...inputs, cost: event.target.value })} inputMode="decimal" />
                </label>
                <label>
                  Margem %
                  <input value={inputs.margin} onChange={(event) => setInputs({ ...inputs, margin: event.target.value })} inputMode="decimal" />
                </label>
                <label>
                  Taxas %
                  <input value={inputs.fee} onChange={(event) => setInputs({ ...inputs, fee: event.target.value })} inputMode="decimal" />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="panel decision-result">
          <div className="panel-heading">
            <h3>{result.title}</h3>
            <Check size={18} />
          </div>
          <p>{result.text}</p>
          <div className="insight success">
            <TrendingUp size={20} />
            <div>
              <strong>Próxima ação</strong>
              <span>{result.action}</span>
            </div>
          </div>
          {lowStock.length > 0 && (
            <div className="insight warning">
              <AlertCircle size={20} />
              <div>
                <strong>{lowStock[0].name} está crítico.</strong>
                <span>Antes de vender mais, veja se esse item limita sua entrega.</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function SalesView({ sales, clients, catalog, newSale, setNewSale, saveSale, deleteSale }) {
  const selectedItem = catalog.find((item) => item.id === newSale.itemId) || catalog[0]
  const paidSales = sales.filter((sale) => sale.status === 'paid')
  const pendingSales = sales.filter((sale) => sale.status === 'pending')
  const totalPaid = paidSales.reduce((acc, sale) => acc + Number(sale.total || 0), 0)
  const totalPending = pendingSales.reduce((acc, sale) => acc + Number(sale.total || 0), 0)
  const quantity = parseAmountInput(newSale.quantity || 1)
  const unitPrice = parseAmountInput(newSale.unitPrice || selectedItem?.price || 0)
  const saleTotal = quantity * unitPrice
  const saleCost = quantity * Number(selectedItem?.cost || 0)
  const saleMargin = saleTotal - saleCost
  const saleStockAfter = selectedItem?.stock === null ? null : Math.max(0, Number(selectedItem?.stock || 0) - quantity)
  const saleCreatesCash = newSale.status === 'paid'

  function selectItem(itemId) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId)
    setNewSale({ ...newSale, itemId, unitPrice: item?.price || '' })
  }

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Vendas e serviços</p>
          <h2>Registre venda paga ou valor a receber</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Vendas pagas" value={money(totalPaid)} icon={ArrowUpRight} tone="green" />
        <Metric title="A receber" value={money(totalPending)} icon={Bell} tone="amber" />
        <Metric title="Pedidos" value={sales.length} icon={ShoppingCart} tone="blue" />
        <Metric title="Clientes" value={clients.length} icon={Users} tone="blue" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Nova venda</h3>
            <ShoppingCart size={18} />
          </div>
          <form className="stack-form" onSubmit={saveSale}>
            <label>
              Cliente
              <input
                list="clients-list"
                value={newSale.clientName}
                onChange={(event) => setNewSale({ ...newSale, clientName: event.target.value })}
                placeholder="Nome do cliente"
              />
              <datalist id="clients-list">
                {clients.map((client) => (
                  <option key={client.id} value={client.name} />
                ))}
              </datalist>
            </label>
            <label>
              Produto, serviço ou projeto
              <select value={newSale.itemId || selectedItem?.id || ''} onChange={(event) => selectItem(event.target.value)}>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Quantidade
                <input value={newSale.quantity} onChange={(event) => setNewSale({ ...newSale, quantity: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                Valor unitário
                <input value={newSale.unitPrice} onChange={(event) => setNewSale({ ...newSale, unitPrice: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                Data
                <input type="date" value={newSale.date} onChange={(event) => setNewSale({ ...newSale, date: event.target.value })} />
              </label>
              <label>
                Vencimento
                <input type="date" value={newSale.due} onChange={(event) => setNewSale({ ...newSale, due: event.target.value })} />
              </label>
            </div>
            <div className="segmented wide">
              <button className={newSale.status === 'paid' ? 'selected' : ''} type="button" onClick={() => setNewSale({ ...newSale, status: 'paid' })}>
                Pago
              </button>
              <button className={newSale.status === 'pending' ? 'selected' : ''} type="button" onClick={() => setNewSale({ ...newSale, status: 'pending' })}>
                A receber
              </button>
            </div>
            <label>
              Observação
              <input value={newSale.notes} onChange={(event) => setNewSale({ ...newSale, notes: event.target.value })} placeholder="Pedido, contrato, entrega ou detalhe" />
            </label>
            <div className="sale-total">
              <span>Total da venda</span>
              <strong>{money(saleTotal)}</strong>
            </div>
            <div className="impact-box">
              <span>{saleCreatesCash ? 'Entra no caixa agora' : 'Cria conta a receber'}</span>
              <span>Margem estimada: <strong className={saleMargin >= 0 ? 'positive' : 'negative'}>{money(saleMargin)}</strong></span>
              <span>
                {saleStockAfter === null
                  ? 'Item sem controle de estoque'
                  : `Estoque após salvar: ${number(saleStockAfter)}`}
              </span>
              {saleStockAfter !== null && saleStockAfter <= Number(selectedItem?.minStock || 0) && (
                <span className="warning-text">Estoque ficará em nível crítico.</span>
              )}
            </div>
            <button className="primary-action" type="submit">
              <Check size={18} />
              Salvar venda
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Vendas recentes</h3>
            <ReceiptText size={18} />
          </div>
          <div className="sales-list">
            {sales.length ? (
              sales.map((sale) => (
                <article key={sale.id} className="sale-row">
                  <div>
                    <span className={`pill ${sale.status === 'paid' ? 'income' : 'transfer'}`}>
                      {sale.status === 'paid' ? 'Pago' : 'A receber'}
                    </span>
                    <strong>{sale.itemName}</strong>
                    <span>
                      {sale.clientName} • {number(sale.quantity)} x {money(sale.unitPrice)} • {new Date(`${sale.date}T12:00:00`).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <strong>{money(sale.total)}</strong>
                  <button className="ghost-icon" type="button" onClick={() => deleteSale(sale.id)} title="Excluir venda">
                    <Trash2 size={17} />
                  </button>
                </article>
              ))
            ) : (
              <p className="empty-state">Nenhuma venda registrada ainda.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

function PurchasesView({ purchases, suppliers, catalog, newPurchase, setNewPurchase, savePurchase, deletePurchase }) {
  const selectedItem = catalog.find((item) => item.id === newPurchase.itemId) || catalog[0]
  const paidPurchases = purchases.filter((purchase) => purchase.status === 'paid')
  const pendingPurchases = purchases.filter((purchase) => purchase.status === 'pending')
  const totalPaid = paidPurchases.reduce((acc, purchase) => acc + Number(purchase.total || 0), 0)
  const totalPending = pendingPurchases.reduce((acc, purchase) => acc + Number(purchase.total || 0), 0)
  const quantity = parseAmountInput(newPurchase.quantity || 1)
  const unitCost = parseAmountInput(newPurchase.unitCost || selectedItem?.cost || 0)
  const purchaseTotal = quantity * unitCost
  const purchaseStockAfter = selectedItem?.stock === null ? null : Number(selectedItem?.stock || 0) + quantity
  const purchaseCreatesCashOut = newPurchase.status === 'paid'

  function selectItem(itemId) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId)
    setNewPurchase({ ...newPurchase, itemId, unitCost: item?.cost || '' })
  }

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Compras e fornecedores</p>
          <h2>Reponha material, estoque ou custo do serviço</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Compras pagas" value={money(totalPaid)} icon={ArrowDownRight} tone="red" />
        <Metric title="A pagar" value={money(totalPending)} icon={Bell} tone="amber" />
        <Metric title="Compras" value={purchases.length} icon={Package} tone="blue" />
        <Metric title="Fornecedores" value={suppliers.length} icon={Users} tone="blue" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Nova compra</h3>
            <Package size={18} />
          </div>
          <form className="stack-form" onSubmit={savePurchase}>
            <label>
              Fornecedor
              <input
                list="suppliers-list"
                value={newPurchase.supplierName}
                onChange={(event) => setNewPurchase({ ...newPurchase, supplierName: event.target.value })}
                placeholder="Nome do fornecedor"
              />
              <datalist id="suppliers-list">
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.name} />
                ))}
              </datalist>
            </label>
            <label>
              Item comprado
              <select value={newPurchase.itemId || selectedItem?.id || ''} onChange={(event) => selectItem(event.target.value)}>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Quantidade
                <input value={newPurchase.quantity} onChange={(event) => setNewPurchase({ ...newPurchase, quantity: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                Custo unitário
                <input value={newPurchase.unitCost} onChange={(event) => setNewPurchase({ ...newPurchase, unitCost: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                Data
                <input type="date" value={newPurchase.date} onChange={(event) => setNewPurchase({ ...newPurchase, date: event.target.value })} />
              </label>
              <label>
                Vencimento
                <input type="date" value={newPurchase.due} onChange={(event) => setNewPurchase({ ...newPurchase, due: event.target.value })} />
              </label>
            </div>
            <div className="segmented wide">
              <button className={newPurchase.status === 'paid' ? 'selected' : ''} type="button" onClick={() => setNewPurchase({ ...newPurchase, status: 'paid' })}>
                Pago
              </button>
              <button className={newPurchase.status === 'pending' ? 'selected' : ''} type="button" onClick={() => setNewPurchase({ ...newPurchase, status: 'pending' })}>
                A pagar
              </button>
            </div>
            <label>
              Observação
              <input value={newPurchase.notes} onChange={(event) => setNewPurchase({ ...newPurchase, notes: event.target.value })} placeholder="Nota, lote, entrega ou detalhe" />
            </label>
            <div className="sale-total expense-total">
              <span>Total da compra</span>
              <strong>{money(purchaseTotal)}</strong>
            </div>
            <div className="impact-box expense-impact">
              <span>{purchaseCreatesCashOut ? 'Sai do caixa agora' : 'Cria conta a pagar'}</span>
              <span>Custo unitário atualizado: <strong>{money(unitCost)}</strong></span>
              <span>
                {purchaseStockAfter === null
                  ? 'Item sem controle de estoque'
                  : `Estoque após salvar: ${number(purchaseStockAfter)}`}
              </span>
            </div>
            <button className="primary-action" type="submit">
              <Check size={18} />
              Salvar compra
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Compras recentes</h3>
            <ReceiptText size={18} />
          </div>
          <div className="sales-list">
            {purchases.length ? (
              purchases.map((purchase) => (
                <article key={purchase.id} className="sale-row">
                  <div>
                    <span className={`pill ${purchase.status === 'paid' ? 'expense' : 'transfer'}`}>
                      {purchase.status === 'paid' ? 'Pago' : 'A pagar'}
                    </span>
                    <strong>{purchase.itemName}</strong>
                    <span>
                      {purchase.supplierName} • {number(purchase.quantity)} x {money(purchase.unitCost)} • {new Date(`${purchase.date}T12:00:00`).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <strong>{money(purchase.total)}</strong>
                  <button className="ghost-icon" type="button" onClick={() => deletePurchase(purchase.id)} title="Excluir compra">
                    <Trash2 size={17} />
                  </button>
                </article>
              ))
            ) : (
              <p className="empty-state">Nenhuma compra registrada ainda.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

function BusinessView({
  data,
  profile,
  totals,
  lowStock,
  newCatalogItem,
  setNewCatalogItem,
  saveCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
}) {
  const margin = totals.businessIncome ? ((totals.businessIncome - totals.businessExpense) / totals.businessIncome) * 100 : 0
  const showStock = ['products', 'production', 'hybrid'].includes(data.user.profile)
  const [priceLab, setPriceLab] = useState({ cost: '20', margin: '35', fee: '5' })
  const priceCost = Number(priceLab.cost || 0)
  const desiredMargin = Number(priceLab.margin || 0)
  const fee = Number(priceLab.fee || 0)
  const suggestedPrice =
    desiredMargin >= 100 ? 0 : priceCost / Math.max(0.01, 1 - desiredMargin / 100) / Math.max(0.01, 1 - fee / 100)
  const suggestedProfit = suggestedPrice - priceCost - suggestedPrice * (fee / 100)

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">{profile.example}</p>
          <h2>Operação adaptada ao seu negócio</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Faturamento" value={money(totals.businessIncome)} icon={TrendingUp} tone="green" />
        <Metric title="Custos e despesas" value={money(totals.businessExpense)} icon={ReceiptText} tone="red" />
        <Metric title="Margem estimada" value={`${number(margin)}%`} icon={BarChart3} tone="blue" />
        <Metric title="Itens críticos" value={lowStock.length} icon={Package} tone="amber" />
      </div>

      <section className="panel price-lab">
        <div className="panel-heading">
          <h3>Preço ideal rápido</h3>
          <BarChart3 size={18} />
        </div>
        <div className="form-grid">
          <label>
            Custo por unidade
            <input value={priceLab.cost} onChange={(event) => setPriceLab({ ...priceLab, cost: event.target.value })} inputMode="decimal" />
          </label>
          <label>
            Margem desejada %
            <input value={priceLab.margin} onChange={(event) => setPriceLab({ ...priceLab, margin: event.target.value })} inputMode="decimal" />
          </label>
          <label>
            Taxas %
            <input value={priceLab.fee} onChange={(event) => setPriceLab({ ...priceLab, fee: event.target.value })} inputMode="decimal" />
          </label>
          <div className="price-result">
            <span>Venda por pelo menos</span>
            <strong>{money(suggestedPrice)}</strong>
            <small>Lucro estimado: {money(suggestedProfit)}</small>
          </div>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Produtos, serviços e materiais</h3>
            <Package size={18} />
          </div>
          <div className="catalog-list">
            {data.catalog.map((item) => (
              <article key={item.id} className="catalog-editor">
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={item.name} onChange={(event) => updateCatalogItem(item.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={item.type}
                      onChange={(event) => {
                        const type = event.target.value
                        updateCatalogItem(item.id, {
                          type,
                          stock: type === 'service' || type === 'project' ? null : Number(item.stock || 0),
                          minStock: type === 'service' || type === 'project' ? null : Number(item.minStock || 0),
                        })
                      }}
                    >
                      <option value="service">Serviço</option>
                      <option value="product">Produto</option>
                      <option value="material">Material</option>
                      <option value="project">Projeto</option>
                    </select>
                  </label>
                  <label>
                    Preço
                    <input value={item.price} onChange={(event) => updateCatalogItem(item.id, { price: Number(event.target.value || 0) })} inputMode="decimal" />
                  </label>
                  <label>
                    Custo
                    <input value={item.cost} onChange={(event) => updateCatalogItem(item.id, { cost: Number(event.target.value || 0) })} inputMode="decimal" />
                  </label>
                  {item.stock !== null && (
                    <>
                      <label>
                        Estoque
                        <input value={item.stock} onChange={(event) => updateCatalogItem(item.id, { stock: Number(event.target.value || 0) })} inputMode="decimal" />
                      </label>
                      <label>
                        Mínimo
                        <input value={item.minStock} onChange={(event) => updateCatalogItem(item.id, { minStock: Number(event.target.value || 0) })} inputMode="decimal" />
                      </label>
                    </>
                  )}
                </div>
                <div className="catalog-actions">
                  <span>
                    {item.price
                      ? `Margem ${number(((Number(item.price) - Number(item.cost || 0)) / Number(item.price || 1)) * 100)}%`
                      : item.stock === null
                        ? 'Sem preço'
                        : `${number(item.stock)} em estoque`}
                  </span>
                  <button type="button" className="ghost-icon" onClick={() => deleteCatalogItem(item.id)} title="Excluir item">
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Adicionar item</h3>
            <Plus size={18} />
          </div>
          <form className="stack-form" onSubmit={saveCatalogItem}>
            <label>
              Nome
              <input value={newCatalogItem.name} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, name: event.target.value })} />
            </label>
            <label>
              Tipo
              <select value={newCatalogItem.type} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, type: event.target.value })}>
                <option value="service">Serviço</option>
                <option value="product">Produto</option>
                <option value="material">Material</option>
                <option value="project">Projeto</option>
              </select>
            </label>
            <div className="form-grid">
              <label>
                Preço
                <input value={newCatalogItem.price} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, price: event.target.value })} />
              </label>
              <label>
                Custo
                <input value={newCatalogItem.cost} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, cost: event.target.value })} />
              </label>
            </div>
            {showStock && (
              <div className="form-grid">
                <label>
                  Estoque
                  <input value={newCatalogItem.stock} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, stock: event.target.value })} />
                </label>
                <label>
                  Mínimo
                  <input value={newCatalogItem.minStock} onChange={(event) => setNewCatalogItem({ ...newCatalogItem, minStock: event.target.value })} />
                </label>
              </div>
            )}
            <button className="primary-action" type="submit">
              <Plus size={18} />
              Adicionar
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}

function ClientsView({ clients, newClient, setNewClient, saveClient, receiveClient, updateClient, deleteClient }) {
  const pending = clients.filter((client) => Number(client.receivable || 0) > 0)
  const active = clients.length

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Clientes e recebimentos</p>
          <h2>Quem compra, quem deve e quem voltou</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Clientes" value={active} icon={Users} tone="blue" />
        <Metric title="Com valor aberto" value={pending.length} icon={Bell} tone="amber" />
        <Metric title="A receber" value={money(pending.reduce((acc, client) => acc + Number(client.receivable || 0), 0))} icon={ArrowUpRight} tone="green" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Lista de clientes</h3>
            <Users size={18} />
          </div>
          <div className="catalog-list">
            {clients.map((client) => (
              <article key={client.id} className="editable-row">
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={client.name} onChange={(event) => updateClient(client.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Telefone
                    <input value={client.phone || ''} onChange={(event) => updateClient(client.id, { phone: event.target.value })} />
                  </label>
                  <label>
                    A receber
                    <input value={client.receivable} onChange={(event) => updateClient(client.id, { receivable: Number(event.target.value || 0) })} inputMode="decimal" />
                  </label>
                  <label>
                    Vencimento
                    <input type="date" value={client.due} onChange={(event) => updateClient(client.id, { due: event.target.value })} />
                  </label>
                </div>
                <div className="catalog-actions">
                  <span>{Number(client.receivable || 0) > 0 ? `${money(client.receivable)} em aberto` : 'em dia'}</span>
                  <div className="row-actions">
                    {Number(client.receivable || 0) > 0 && (
                      <button type="button" onClick={() => receiveClient(client)} title="Receber">
                        <Check size={18} />
                      </button>
                    )}
                    <button type="button" onClick={() => deleteClient(client.id)} title="Excluir cliente">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Novo cliente</h3>
            <Plus size={18} />
          </div>
          <form className="stack-form" onSubmit={saveClient}>
            <label>
              Nome
              <input value={newClient.name} onChange={(event) => setNewClient({ ...newClient, name: event.target.value })} placeholder="Ex: Maria Souza" />
            </label>
            <label>
              Telefone
              <input value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} placeholder="WhatsApp do cliente" />
            </label>
            <div className="form-grid">
              <label>
                Valor a receber
                <input value={newClient.receivable} onChange={(event) => setNewClient({ ...newClient, receivable: event.target.value })} placeholder="0,00" />
              </label>
              <label>
                Vencimento
                <input type="date" value={newClient.due} onChange={(event) => setNewClient({ ...newClient, due: event.target.value })} />
              </label>
            </div>
            <label>
              Observação
              <input value={newClient.notes} onChange={(event) => setNewClient({ ...newClient, notes: event.target.value })} placeholder="Serviço, projeto ou pedido" />
            </label>
            <button className="primary-action" type="submit">
              <Plus size={18} />
              Salvar cliente
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}

function BillsView({ bills, totals, newBill, setNewBill, saveBill, payBill, deleteBill, updateBill }) {
  const openBills = bills.filter((bill) => bill.status !== 'paid')
  const todayDate = today()
  const overdueBills = openBills.filter((bill) => bill.due < todayDate)
  const dueTodayBills = openBills.filter((bill) => bill.due === todayDate)
  const sorted = [...bills].sort((a, b) => `${a.due}`.localeCompare(`${b.due}`))

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Calendario financeiro</p>
          <h2>Contas a pagar e receber</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="A pagar" value={money(totals.billsPayable)} icon={ArrowDownRight} tone="red" />
        <Metric title="A receber" value={money(totals.billsReceivable)} icon={ArrowUpRight} tone="green" />
        <Metric title="Em aberto" value={openBills.length} icon={ClipboardList} tone="amber" />
        <Metric title="Vencidas hoje" value={overdueBills.length + dueTodayBills.length} icon={AlertCircle} tone="red" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Agenda de contas</h3>
            <Bell size={18} />
          </div>
          <div className="catalog-list">
            {sorted.length ? sorted.map((bill) => {
              const billState = bill.status === 'paid' ? 'paid' : bill.due < todayDate ? 'overdue' : bill.due === todayDate ? 'today' : 'open'
              return (
              <article key={bill.id} className={`editable-row bill-editor ${billState}`}>
                <div className="bill-status-line">
                  <span className={`pill ${bill.type === 'receivable' ? 'income' : 'expense'}`}>
                    {bill.type === 'receivable' ? 'Receber' : 'Pagar'}
                  </span>
                  <strong>
                    {billState === 'paid'
                      ? 'Concluída'
                      : billState === 'overdue'
                        ? 'Vencida'
                        : billState === 'today'
                          ? 'Vence hoje'
                          : 'Aberta'}
                  </strong>
                </div>
                <div className="form-grid">
                  <label>
                    Tipo
                    <select value={bill.type} onChange={(event) => updateBill(bill.id, { type: event.target.value })}>
                      <option value="payable">Pagar</option>
                      <option value="receivable">Receber</option>
                    </select>
                  </label>
                  <label>
                    Descrição
                    <input value={bill.title} onChange={(event) => updateBill(bill.id, { title: event.target.value })} />
                  </label>
                  <label>
                    Valor
                    <input value={bill.amount} onChange={(event) => updateBill(bill.id, { amount: parseAmountInput(event.target.value) })} inputMode="decimal" />
                  </label>
                  <label>
                    Vencimento
                    <input type="date" value={bill.due} onChange={(event) => updateBill(bill.id, { due: event.target.value })} />
                  </label>
                  <label>
                    Área
                    <select value={bill.scope} onChange={(event) => updateBill(bill.id, { scope: event.target.value })}>
                      <option value="business">Negócio</option>
                      <option value="personal">Pessoal</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={bill.status} onChange={(event) => updateBill(bill.id, { status: event.target.value })}>
                      <option value="open">Aberta</option>
                      <option value="paid">Paga/recebida</option>
                    </select>
                  </label>
                </div>
                <div className="catalog-actions">
                  <span>{bill.type === 'receivable' ? 'Receber' : 'Pagar'} {money(bill.amount)}</span>
                  <div className="row-actions">
                    {bill.status !== 'paid' && (
                      <button type="button" onClick={() => payBill(bill)} title={bill.type === 'receivable' ? 'Marcar recebido' : 'Marcar pago'}>
                        <Check size={18} />
                      </button>
                    )}
                    <button type="button" onClick={() => deleteBill(bill.id)} title="Excluir conta">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </article>
            )}) : (
              <p className="empty-state">Nenhuma conta cadastrada ainda.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Nova conta</h3>
            <Plus size={18} />
          </div>
          <form className="stack-form" onSubmit={saveBill}>
            <div className="segmented">
              {['payable', 'receivable'].map((type) => (
                <button key={type} className={newBill.type === type ? 'selected' : ''} type="button" onClick={() => setNewBill({ ...newBill, type })}>
                  {type === 'payable' ? 'Pagar' : 'Receber'}
                </button>
              ))}
            </div>
            <label>
              Descrição
              <input value={newBill.title} onChange={(event) => setNewBill({ ...newBill, title: event.target.value })} placeholder="Ex: Aluguel, cliente Ana" />
            </label>
            <div className="form-grid">
              <label>
                Valor
                <input value={newBill.amount} onChange={(event) => setNewBill({ ...newBill, amount: event.target.value })} placeholder="0,00" />
              </label>
              <label>
                Vencimento
                <input type="date" value={newBill.due} onChange={(event) => setNewBill({ ...newBill, due: event.target.value })} />
              </label>
              <label>
                Área
                <select value={newBill.scope} onChange={(event) => setNewBill({ ...newBill, scope: event.target.value })}>
                  <option value="business">Negócio</option>
                  <option value="personal">Pessoal</option>
                </select>
              </label>
              <label>
                Categoria
                <select value={newBill.category} onChange={(event) => setNewBill({ ...newBill, category: event.target.value })}>
                  {[...categories.expense, ...categories.income].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary-action" type="submit">
              <Plus size={18} />
              Salvar conta
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}

function PersonalView({
  totals,
  accountBalances,
  transactions,
  newAccount,
  setNewAccount,
  saveAccount,
  updateAccount,
  deleteAccount,
  onDelete,
  onUpdate,
  accounts,
}) {
  const [filters, setFilters] = useState({ scope: 'all', type: 'all', text: '' })
  const filteredTransactions = transactions.filter((item) => {
    const matchesScope = filters.scope === 'all' || item.scope === filters.scope
    const matchesType = filters.type === 'all' || item.type === filters.type
    const text = normalizeText(`${item.title} ${item.category} ${item.note || ''}`)
    const matchesText = !filters.text || text.includes(normalizeText(filters.text))
    return matchesScope && matchesType && matchesText
  })

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Vida pessoal sem misturar com o caixa</p>
          <h2>Seu dinheiro pessoal</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Entradas pessoais" value={money(totals.personalIncome)} icon={ArrowUpRight} tone="green" />
        <Metric title="Gastos pessoais" value={money(totals.personalExpense)} icon={ArrowDownRight} tone="red" />
        <Metric
          title="Disponível"
          value={money(accountBalances.filter((account) => account.scope !== 'business').reduce((acc, account) => acc + account.current, 0))}
          icon={Wallet}
          tone="blue"
        />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h3>Histórico</h3>
          <Calendar size={18} />
        </div>
        <div className="filter-bar">
          <input value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} placeholder="Buscar por descrição ou categoria" />
          <select value={filters.scope} onChange={(event) => setFilters({ ...filters, scope: event.target.value })}>
            <option value="all">Todas as áreas</option>
            <option value="business">Negócio</option>
            <option value="personal">Pessoal</option>
          </select>
          <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
            <option value="all">Todos os tipos</option>
            <option value="income">Entradas</option>
            <option value="expense">Saídas</option>
            <option value="transfer">Transferências</option>
          </select>
        </div>
        <TransactionList items={filteredTransactions} accounts={accounts} onUpdate={onUpdate} onDelete={onDelete} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Contas e carteiras</h3>
          <Landmark size={18} />
        </div>
        <div className="account-grid">
          {accountBalances.map((account) => (
            <article key={account.id} className="account-card">
              <label>
                Nome
                <input value={account.name} onChange={(event) => updateAccount(account.id, { name: event.target.value })} />
              </label>
              <label>
                Área
                <select value={account.scope} onChange={(event) => updateAccount(account.id, { scope: event.target.value })}>
                  <option value="business">Negócio</option>
                  <option value="personal">Pessoal</option>
                  <option value="both">Ambos</option>
                </select>
              </label>
              <p>{money(account.current)}</p>
              <button className="mini-action" type="button" onClick={() => deleteAccount(account.id)}>
                Excluir
              </button>
            </article>
          ))}
        </div>
        <form className="manual-form inline-form" onSubmit={saveAccount}>
          <div className="form-grid">
            <label>
              Nome da conta
              <input value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} placeholder="Ex: Nubank, caixa físico" />
            </label>
            <label>
              Saldo inicial
              <input value={newAccount.balance} onChange={(event) => setNewAccount({ ...newAccount, balance: event.target.value })} placeholder="0,00" />
            </label>
            <label>
              Área
              <select value={newAccount.scope} onChange={(event) => setNewAccount({ ...newAccount, scope: event.target.value })}>
                <option value="business">Negócio</option>
                <option value="personal">Pessoal</option>
                <option value="both">Ambos</option>
              </select>
            </label>
            <label>
              Tipo
              <select value={newAccount.type} onChange={(event) => setNewAccount({ ...newAccount, type: event.target.value })}>
                <option value="cash">Dinheiro</option>
                <option value="bank">Banco</option>
                <option value="card">Cartão</option>
                <option value="reserve">Reserva</option>
              </select>
            </label>
          </div>
          <button className="primary-action" type="submit">
            <Plus size={18} />
            Adicionar conta
          </button>
        </form>
      </section>
    </section>
  )
}

function ReportsView({ data, totals, accountBalances, lowStock }) {
  const byCategory = data.transactions.reduce((acc, item) => {
    const key = item.category || 'Outros'
    acc[key] = (acc[key] || 0) + Number(item.amount || 0)
    return acc
  }, {})
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const profit = totals.businessIncome - totals.businessExpense
  const personalNet = totals.personalIncome - totals.personalExpense
  const totalBalance = accountBalances.reduce((acc, account) => acc + account.current, 0)
  const now = new Date(`${today()}T12:00:00`)
  const cashflow = data.bills
    .filter((bill) => bill.status !== 'paid')
    .map((bill) => ({ ...bill, date: new Date(`${bill.due}T12:00:00`) }))
    .filter((bill) => {
      const diffDays = (bill.date - now) / 86400000
      return diffDays >= 0 && diffDays <= 30
    })
    .sort((a, b) => a.date - b.date)
    .reduce(
      (acc, bill) => {
        const projectedBalance =
          acc.balance + (bill.type === 'receivable' ? Number(bill.amount || 0) : -Number(bill.amount || 0))
        return {
          balance: projectedBalance,
          items: [...acc.items, { ...bill, projectedBalance }],
        }
      },
      { balance: totalBalance, items: [] },
    ).items

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Relatorio simples</p>
          <h2>O que mudou no seu dinheiro</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title="Lucro estimado" value={money(profit)} icon={TrendingUp} tone={profit >= 0 ? 'green' : 'red'} />
        <Metric title="Resultado pessoal" value={money(personalNet)} icon={Wallet} tone={personalNet >= 0 ? 'green' : 'red'} />
        <Metric title="Saldo total" value={money(totalBalance)} icon={Landmark} tone="blue" />
        <Metric title="Estoque critico" value={lowStock.length} icon={Package} tone="amber" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Leitura do mes</h3>
            <FileText size={18} />
          </div>
          <div className="report-copy">
            <p>
              Seu negocio faturou <strong>{money(totals.businessIncome)}</strong> e teve <strong>{money(totals.businessExpense)}</strong> em custos e despesas.
            </p>
            <p>
              Existem <strong>{money(totals.billsPayable)}</strong> em contas abertas para pagar e <strong>{money(totals.billsReceivable + totals.receivable)}</strong> para receber.
            </p>
            <p>
              {lowStock.length
                ? `${lowStock[0].name} merece atencao antes de aceitar mais demanda.`
                : 'Nenhum item esta abaixo do minimo cadastrado agora.'}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Maiores categorias</h3>
            <BarChart3 size={18} />
          </div>
          <div className="category-bars">
            {topCategories.map(([category, value]) => {
              const max = topCategories[0]?.[1] || 1
              return (
                <div key={category} className="category-row">
                  <div>
                    <strong>{category}</strong>
                    <span>{money(value)}</span>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h3>Próximos 30 dias</h3>
          <Calendar size={18} />
        </div>
        <div className="cashflow-list">
          {cashflow.length ? (
            cashflow.map((bill) => (
              <article key={bill.id} className="cashflow-item">
                <div>
                  <strong>{bill.title}</strong>
                  <span>{bill.type === 'receivable' ? 'Entrada prevista' : 'Saída prevista'} • {bill.date.toLocaleDateString('pt-BR')}</span>
                </div>
                <strong className={bill.type === 'receivable' ? 'positive' : 'negative'}>
                  {bill.type === 'receivable' ? '+' : '-'}
                  {money(bill.amount)}
                </strong>
                <span>Saldo projetado: {money(bill.projectedBalance)}</span>
              </article>
            ))
          ) : (
            <p className="empty-state">Nenhuma conta aberta nos próximos 30 dias.</p>
          )}
        </div>
      </section>
    </section>
  )
}

function SettingsView({ data, exportBackup, importBackup, resetAppData }) {
  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Controle e seguranca</p>
          <h2>Ajustes do app</h2>
        </div>
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Backup local</h3>
            <Download size={18} />
          </div>
          <div className="settings-actions">
            <button className="primary-action" type="button" onClick={exportBackup}>
              <Download size={18} />
              Exportar dados
            </button>
            <label className="file-action">
              <span>Importar backup</span>
              <input type="file" accept="application/json" onChange={importBackup} />
            </label>
            <button className="danger-action" type="button" onClick={resetAppData}>
              <RotateCcw size={18} />
              Reiniciar dados
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Estado atual</h3>
            <Settings size={18} />
          </div>
          <div className="settings-summary">
            <p><strong>Usuario:</strong> {data.user.name}</p>
            <p><strong>Negocio:</strong> {data.user.businessName}</p>
            <p><strong>Perfil:</strong> {profileOptions.find((item) => item.id === data.user.profile)?.label}</p>
            <p><strong>Movimentos:</strong> {data.transactions.length}</p>
            <p><strong>Itens de operacao:</strong> {data.catalog.length}</p>
          </div>
        </section>
      </div>
    </section>
  )
}

function GoalsView({ goals, newGoal, setNewGoal, saveGoal, goalDrafts, setGoalDrafts, contributeToGoal }) {
  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">Metas que viram rotina</p>
          <h2>Objetivos financeiros</h2>
        </div>
      </div>

      <div className="goal-grid">
        {goals.map((goal) => {
          const progress = Math.min(100, (Number(goal.current || 0) / Number(goal.target || 1)) * 100)
          return (
            <article className="goal-card" key={goal.id}>
              <div className="goal-top">
                <strong>{goal.title}</strong>
                <span>{goal.scope === 'business' ? 'Negócio' : 'Pessoal'}</span>
              </div>
              <div className="progress-bar">
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>
                {money(goal.current)} de {money(goal.target)} até {new Date(goal.due).toLocaleDateString('pt-BR')}
              </p>
              <div className="goal-contribution">
                <input
                  value={goalDrafts[goal.id] || ''}
                  onChange={(event) => setGoalDrafts((current) => ({ ...current, [goal.id]: event.target.value }))}
                  placeholder="Aporte"
                  inputMode="decimal"
                />
                <button type="button" className="mini-action" onClick={() => contributeToGoal(goal)}>
                  Adicionar
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h3>Criar meta</h3>
          <Target size={18} />
        </div>
        <form className="manual-form" onSubmit={saveGoal}>
          <div className="form-grid">
            <label>
              Nome da meta
              <input value={newGoal.title} onChange={(event) => setNewGoal({ ...newGoal, title: event.target.value })} placeholder="Ex: Comprar equipamento" />
            </label>
            <label>
              Valor
              <input value={newGoal.target} onChange={(event) => setNewGoal({ ...newGoal, target: event.target.value })} placeholder="0,00" />
            </label>
            <label>
              Prazo
              <input type="date" value={newGoal.due} onChange={(event) => setNewGoal({ ...newGoal, due: event.target.value })} />
            </label>
          </div>
          <button className="primary-action" type="submit">
            <Plus size={18} />
            Criar meta
          </button>
        </form>
      </section>
    </section>
  )
}

function Metric({ title, value, icon: Icon, tone }) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function TransactionList({ items, compact = false, onDelete, onUpdate, accounts = [] }) {
  const [editingId, setEditingId] = useState(null)

  if (!items.length) {
    return <p className="empty-state">Nenhum movimento ainda. Registre por voz, texto ou formulário.</p>
  }

  return (
    <div className={`transaction-list ${compact ? 'compact' : ''}`}>
      {items.map((item) => (
        <article key={item.id} className="transaction-item">
          <div className={`transaction-icon ${item.type}`}>
            {item.type === 'income' ? <ArrowUpRight size={18} /> : item.type === 'expense' ? <ArrowDownRight size={18} /> : <CreditCard size={18} />}
          </div>
          {editingId === item.id && onUpdate ? (
            <div className="transaction-editor">
              <div className="form-grid">
                <label>
                  Descrição
                  <input value={item.title} onChange={(event) => onUpdate(item.id, { title: event.target.value, itemName: event.target.value })} />
                </label>
                <label>
                  Valor
                  <input value={item.amount} onChange={(event) => onUpdate(item.id, { amount: Number(event.target.value || 0) })} inputMode="decimal" />
                </label>
                <label>
                  Tipo
                  <select value={item.type} onChange={(event) => onUpdate(item.id, { type: event.target.value })}>
                    <option value="income">Entrada</option>
                    <option value="expense">Saída</option>
                    <option value="transfer">Transferência</option>
                  </select>
                </label>
                <label>
                  Área
                  <select
                    value={item.scope}
                    onChange={(event) => {
                      const scope = event.target.value
                      onUpdate(item.id, { scope, accountId: getDefaultAccountId(accounts, scope) })
                    }}
                  >
                    <option value="business">Negócio</option>
                    <option value="personal">Pessoal</option>
                  </select>
                </label>
                <label>
                  Conta
                  <select value={item.accountId} onChange={(event) => onUpdate(item.id, { accountId: event.target.value })}>
                    {getAccountOptions(accounts, item.scope).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Data
                  <input type="date" value={item.date} onChange={(event) => onUpdate(item.id, { date: event.target.value })} />
                </label>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setEditingId(null)} title="Concluir edição">
                  <Check size={18} />
                </button>
                {onDelete && (
                  <button type="button" onClick={() => onDelete(item.id)} title="Excluir lançamento">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="transaction-main">
                <strong>{item.title}</strong>
                <span>
                  {item.category} • {item.scope === 'business' ? 'Negócio' : 'Pessoal'} •{' '}
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <strong className={item.type === 'income' ? 'positive' : item.type === 'expense' ? 'negative' : ''}>
                {item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}
                {money(item.amount)}
              </strong>
              <div className="row-actions">
                {onUpdate && (
                  <button type="button" onClick={() => setEditingId(item.id)} title="Editar lançamento">
                    <ReceiptText size={17} />
                  </button>
                )}
                {onDelete && (
                  <button type="button" onClick={() => onDelete(item.id)} title="Excluir lançamento">
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  )
}

export default App
