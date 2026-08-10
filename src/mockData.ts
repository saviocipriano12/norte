export type EntryContext = 'Pessoal' | 'Negocio' | 'Compartilhado';
export type AppTab = 'home' | 'assistant' | 'moves' | 'wallet' | 'plan';
export type OrbMode = 'idle' | 'listening' | 'thinking' | 'responding';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type DraftEntry = {
  id: string;
  type: 'income' | 'expense';
  title: string;
  amount: number;
  context?: EntryContext;
  question?: string;
  note: string;
  walletAccountId?: string | null;
  cardId?: string | null;
};

export type Movement = {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  context: EntryContext;
  source: 'IA' | 'Manual';
  createdAt: string;
  account: string;
  walletAccountId?: string | null;
  cardId?: string | null;
};

export type Account = {
  id: string;
  name: string;
  balance: number;
  detail: string;
  kind: string;
  isBusiness: boolean;
};

export type WalletCard = {
  id: string;
  name: string;
  limit: number;
  used: number;
  walletAccountId?: string | null;
};

export type UpcomingBill = {
  id: string;
  title: string;
  due: string;
  amount: number;
  context: EntryContext;
};

export type Goal = {
  id: string;
  title: string;
  current: number;
  target: number;
};

export const onboardingProfiles = [
  {
    id: 'personal',
    title: 'Vida pessoal',
    description: 'Quero controlar melhor meus gastos e sobrar dinheiro no fim do mes.',
  },
  {
    id: 'freelancer',
    title: 'Freela / autonomo',
    description: 'Recebo por Pix, misturo entradas e preciso enxergar meu caixa com clareza.',
  },
  {
    id: 'business',
    title: 'MEI / pequeno negocio',
    description: 'Quero separar a operacao, entender lucro e nao perder contas importantes.',
  },
] as const;

export const painPoints = [
  'Misturo pessoal com negocio',
  'Esqueco de lancar gastos',
  'Nao sei quanto posso gastar',
  'Tenho dinheiro a receber',
];

export const initialAssistantInput =
  'Gastei 40 reais na padaria, recebi 300 do cliente Joao e paguei 120 de internet.';

export const initialMessages: Message[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: 'Me conte seu dia financeiro com palavras simples. Eu organizo em rascunhos, faco perguntas quando faltar contexto e so salvo depois da sua confirmacao.',
  },
];

export const initialDrafts: DraftEntry[] = [];

export const initialMovements: Movement[] = [
  {
    id: 'mv1',
    title: 'Assinatura de design',
    amount: 89,
    type: 'expense',
    context: 'Negocio',
    source: 'Manual',
    createdAt: '2026-08-10T09:20:00.000Z',
    account: 'Conta PJ',
  },
  {
    id: 'mv2',
    title: 'Mercado da semana',
    amount: 236,
    type: 'expense',
    context: 'Pessoal',
    source: 'IA',
    createdAt: '2026-08-09T19:42:00.000Z',
    account: 'Conta pessoal',
  },
  {
    id: 'mv3',
    title: 'Projeto Mariana',
    amount: 1600,
    type: 'income',
    context: 'Negocio',
    source: 'IA',
    createdAt: '2026-08-09T14:08:00.000Z',
    account: 'Conta PJ',
  },
  {
    id: 'mv4',
    title: 'Streaming',
    amount: 39,
    type: 'expense',
    context: 'Pessoal',
    source: 'Manual',
    createdAt: '2026-08-08T21:04:00.000Z',
    account: 'Conta pessoal',
  },
];

export const initialAccounts: Account[] = [
  {
    id: 'a1',
    name: 'Conta pessoal',
    balance: 2480,
    detail: 'Banco principal',
    kind: 'cash',
    isBusiness: false,
  },
  {
    id: 'a2',
    name: 'Conta PJ',
    balance: 6310,
    detail: 'Caixa do negocio',
    kind: 'cash',
    isBusiness: true,
  },
  {
    id: 'a3',
    name: 'Reserva',
    balance: 9200,
    detail: 'Meta de seguranca',
    kind: 'reserve',
    isBusiness: false,
  },
];

export const initialCards: WalletCard[] = [
  {
    id: 'c1',
    name: 'Cartao Black',
    limit: 12000,
    used: 3240,
    walletAccountId: 'a1',
  },
  {
    id: 'c2',
    name: 'Cartao do negocio',
    limit: 6000,
    used: 1280,
    walletAccountId: 'a2',
  },
];

export const upcomingBills: UpcomingBill[] = [
  {
    id: 'u1',
    title: 'Internet',
    due: '2026-08-11',
    amount: 120,
    context: 'Compartilhado',
  },
  {
    id: 'u2',
    title: 'DAS MEI',
    due: '2026-08-14',
    amount: 76,
    context: 'Negocio',
  },
  {
    id: 'u3',
    title: 'Aluguel',
    due: '2026-08-18',
    amount: 1450,
    context: 'Pessoal',
  },
];

export const goals: Goal[] = [
  {
    id: 'g1',
    title: 'Reserva pessoal',
    current: 9200,
    target: 15000,
  },
  {
    id: 'g2',
    title: 'Troca do notebook',
    current: 2100,
    target: 6500,
  },
];
