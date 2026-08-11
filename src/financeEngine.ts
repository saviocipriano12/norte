import type { Account, DraftEntry, EntryContext, Movement, MovementCategory } from './mockData';

export type CashForecast = {
  projectedEndBalance: number;
  lowestBalance: number;
  riskDate: string | null;
  scheduledOutflows: number;
};

export function buildCashForecast(input: {
  today: string;
  startingBalance: number;
  dailyNet: number;
  immediateOutflows: number;
  datedOutflows: Array<{ due: string; amount: number }>;
  horizonDays?: number;
}): CashForecast {
  const horizonDays = input.horizonDays ?? 30;
  const start = new Date(`${input.today}T12:00:00`);
  let balance = input.startingBalance - input.immediateOutflows;
  let lowestBalance = balance;
  let riskDate: string | null = balance < 0 ? input.today : null;
  const datedOutflows = new Map<string, number>();

  input.datedOutflows.forEach((item) => {
    const current = datedOutflows.get(item.due) ?? 0;
    datedOutflows.set(item.due, current + item.amount);
  });

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    const date = current.toISOString().slice(0, 10);

    if (offset > 0) {
      balance += input.dailyNet;
    }
    balance -= datedOutflows.get(date) ?? 0;

    if (balance < lowestBalance) {
      lowestBalance = balance;
    }
    if (!riskDate && balance < 0) {
      riskDate = date;
    }
  }

  return {
    projectedEndBalance: balance,
    lowestBalance,
    riskDate,
    scheduledOutflows: input.datedOutflows.reduce((total, item) => total + item.amount, 0),
  };
}

const expenseVerbs = ['gastei', 'paguei', 'comprei', 'usei', 'debitei', 'passei'];
const incomeVerbs = ['recebi', 'ganhei', 'entrou', 'caiu', 'vendi', 'me pagaram'];
const businessHints = [
  'cliente',
  'projeto',
  'freela',
  'freelance',
  'servico',
  'software',
  'anuncio',
  'marketing',
  'fornecedor',
  'mei',
  'empresa',
  'pj',
  'negocio',
  'venda',
];
const personalHints = ['salario', 'mercado', 'farmacia', 'streaming', 'ifood', 'casa', 'apartamento'];
const sharedHints = ['internet', 'telefone', 'celular', 'luz', 'agua', 'aluguel', 'combustivel', 'gasolina'];
const workMealHints = ['padaria', 'cafe', 'almoco', 'janta', 'lanche'];

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseCurrencyInput(value: string) {
  const normalized = value.trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');

  if (!normalized) {
    return Number.NaN;
  }

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? Number(normalized.replace(/\./g, '').replace(',', '.'))
      : Number(normalized.replace(/,/g, ''));
  }

  if (lastComma >= 0) {
    return Number(normalized.replace(',', '.'));
  }

  if ((normalized.match(/\./g) ?? []).length > 1) {
    return Number(normalized.replace(/\./g, ''));
  }

  const [whole, decimals] = normalized.split('.');
  return decimals?.length === 3 && whole.length <= 3
    ? Number(`${whole}${decimals}`)
    : Number(normalized);
}

function parseAmount(segment: string) {
  const match = segment.match(
    /(?:r\$\s*)?((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)(?:\s*reais?)?/i,
  );

  if (!match) {
    return null;
  }

  const raw = match[1];
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const separatorIndex = Math.max(lastComma, lastDot);
  const fractionLength = separatorIndex >= 0 ? raw.length - separatorIndex - 1 : 0;
  const hasDecimalPart = separatorIndex >= 0 && fractionLength > 0 && fractionLength <= 2;

  if (!hasDecimalPart) {
    return Number(raw.replace(/[.,]/g, ''));
  }

  const normalized = raw
    .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
    .replace(decimalSeparator, '.');

  return Number(normalized);
}

export function parseDraftCorrectionAmount(input: string) {
  const normalized = normalizeText(input);
  if (!/(nao|corrig|correc|era|foi|valor)/.test(normalized)) {
    return null;
  }

  const matches = Array.from(
    input.matchAll(/(?:r\$\s*)?((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)(?:\s*reais?)?/gi),
  );
  const firstAmount = matches[0]?.[0];
  if (!firstAmount) {
    return null;
  }

  const amount = parseAmount(firstAmount);
  return amount && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function inferType(normalizedSegment: string): 'income' | 'expense' | null {
  if (incomeVerbs.some((verb) => normalizedSegment.includes(verb))) {
    return 'income';
  }

  if (expenseVerbs.some((verb) => normalizedSegment.includes(verb))) {
    return 'expense';
  }

  return null;
}

function extractTitle(segment: string, type: 'income' | 'expense') {
  const verbs = type === 'income' ? incomeVerbs : expenseVerbs;
  let title = segment.trim();

  const verbPattern = new RegExp(`^(eu\\s+)?(${verbs.join('|')})\\s+`, 'i');
  title = title.replace(verbPattern, '');
  title = title.replace(
    /(?:r\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(reais?)?/i,
    '',
  );
  title = title.replace(/^(na|no|de|do|da|pro|pra|para|com)\s+/i, '');
  title = title.replace(/[.]+$/g, '').trim();

  if (!title) {
    return type === 'income' ? 'Entrada informada' : 'Gasto informado';
  }

  return capitalize(title);
}

function inferContext(segment: string, title: string, type: 'income' | 'expense') {
  const normalized = normalizeText(`${segment} ${title}`);

  if (sharedHints.some((hint) => normalized.includes(hint))) {
    return {
      question: 'Esse item e da casa, do negocio ou dividido entre os dois?',
    };
  }

  if (workMealHints.some((hint) => normalized.includes(hint))) {
    return {
      question: 'Esse gasto foi pessoal ou ligado ao trabalho?',
    };
  }

  if (businessHints.some((hint) => normalized.includes(hint))) {
    return {
      context: 'Negocio' as EntryContext,
    };
  }

  if (personalHints.some((hint) => normalized.includes(hint))) {
    return {
      context: 'Pessoal' as EntryContext,
    };
  }

  if (type === 'income') {
    return {
      question: 'Essa entrada e pessoal ou do negocio?',
    };
  }

  return {
    question: 'Esse gasto foi pessoal, do negocio ou compartilhado?',
  };
}

export function inferMovementCategory(segment: string, type: 'income' | 'expense'): MovementCategory {
  const normalized = normalizeText(segment);
  if (/mercado|padaria|cafe|almoco|janta|lanche|ifood|restaurante/.test(normalized)) return 'Alimentacao';
  if (/aluguel|condominio|casa|apartamento|energia|luz|agua/.test(normalized)) return 'Moradia';
  if (/uber|99|gasolina|combustivel|onibus|metro|estacionamento/.test(normalized)) return 'Transporte';
  if (/netflix|spotify|streaming|assinatura/.test(normalized)) return 'Assinaturas';
  if (/farmacia|medico|consulta|academia|terapia/.test(normalized)) return 'Saude';
  if (/curso|faculdade|livro|escola/.test(normalized)) return 'Educacao';
  if (/cinema|viagem|show|jogo/.test(normalized)) return 'Lazer';
  if (/das|imposto|tributo|mei/.test(normalized)) return 'Impostos';
  if (type === 'income' && /venda|produto/.test(normalized)) return 'Vendas';
  if (type === 'income' || /cliente|projeto|freela|servico|software|marketing|fornecedor/.test(normalized)) return 'Servicos';
  if (/notebook|computador|material|anuncio/.test(normalized)) return 'Trabalho';
  return 'Outros';
}

function buildNote(type: 'income' | 'expense', hasQuestion: boolean) {
  if (type === 'income') {
    return hasQuestion ? 'Entrada identificada, aguardando contexto.' : 'Entrada pronta para confirmacao.';
  }

  return hasQuestion ? 'Despesa identificada, aguardando contexto.' : 'Despesa pronta para confirmacao.';
}

export function inferOccurrenceDate(segment: string, referenceDate = new Date()) {
  const result = new Date(referenceDate);
  const normalized = normalizeText(segment);
  if (/\bontem\b/.test(normalized)) result.setDate(result.getDate() - 1);
  if (/\bamanha\b/.test(normalized)) result.setDate(result.getDate() + 1);
  if (/\bmes que vem\b/.test(normalized)) result.setMonth(result.getMonth() + 1);
  const day = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (day) result.setDate(Number(day[1]));
  const weekdays: Array<[RegExp, number]> = [
    [/\bdomingo\b/, 0],
    [/\bsegunda(?:-feira)?\b/, 1],
    [/\bterca(?:-feira)?\b/, 2],
    [/\bquarta(?:-feira)?\b/, 3],
    [/\bquinta(?:-feira)?\b/, 4],
    [/\bsexta(?:-feira)?\b/, 5],
    [/\bsabado\b/, 6],
  ];
  const weekday = weekdays.find(([pattern]) => pattern.test(normalized));
  if (weekday) {
    const daysAhead = (weekday[1] - result.getDay() + 7) % 7;
    result.setDate(result.getDate() + daysAhead);
  }
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}

export function parseDraftCorrectionDate(input: string, referenceDate = new Date()) {
  const normalized = normalizeText(input);
  if (!/\b(ontem|hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|dia\s+\d{1,2}|mes que vem)\b/.test(normalized)) {
    return null;
  }

  return inferOccurrenceDate(input, referenceDate);
}

export function parseFinanceMessage(input: string) {
  const prepared = input.replace(
    /\s+e\s+(?=(gastei|paguei|comprei|recebi|ganhei|entrou|caiu|vendi|me pagaram)\b)/gi,
    ', ',
  );
  const segments = prepared
    .split(/(?:,\s+|\n|;)+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const drafts: DraftEntry[] = [];

  segments.forEach((segment) => {
    const amount = parseAmount(segment);
    const type = inferType(normalizeText(segment));

    if (!amount || !type) {
      return;
    }

    const title = extractTitle(segment, type);
    const contextInfo = inferContext(segment, title, type);

    drafts.push({
      id: makeId('draft'),
      type,
      title,
      amount,
      context: contextInfo.context,
      question: contextInfo.question,
      note: buildNote(type, Boolean(contextInfo.question)),
      occurredAt: inferOccurrenceDate(segment),
      category: inferMovementCategory(segment, type),
    });
  });

  const pendingQuestions = drafts.filter((draft) => !draft.context).length;
  const countText = drafts.length === 1 ? '1 movimento' : `${drafts.length} movimentos`;
  const questionText =
    pendingQuestions === 0
      ? 'Revise os rascunhos e confirme para salvar.'
      : `Antes de salvar, preciso confirmar ${pendingQuestions} ponto${pendingQuestions > 1 ? 's' : ''}.`;

  return {
    drafts,
    reply:
      drafts.length === 0
        ? 'Nao consegui entender movimentos suficientes nessa frase. Tente algo como: gastei 40 na padaria e recebi 300 do cliente Joao.'
        : `Entendi ${countText}. ${questionText}`,
  };
}

export function formatMovementDate(isoDate: string) {
  const value = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - value.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return 'Agora';
  }

  if (diffHours < 24) {
    return `${diffHours}h atras`;
  }

  if (diffDays === 1) {
    return 'Ontem';
  }

  if (diffDays < 7) {
    return `${diffDays} dias atras`;
  }

  return value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

export function movementBusinessWeight(context: EntryContext) {
  if (context === 'Negocio') {
    return 1;
  }

  if (context === 'Compartilhado') {
    return 0.5;
  }

  return 0;
}

export function applyMovementToAccounts(currentAccounts: Account[], movement: Movement, direction = 1) {
  const delta = (movement.type === 'income' ? movement.amount : -movement.amount) * direction;

  return currentAccounts.map((account) =>
    account.id === movement.walletAccountId || account.name === movement.account
      ? { ...account, balance: account.balance + delta }
      : account,
  );
}

export function resolveMovementAccount(context: EntryContext) {
  if (context === 'Negocio') {
    return 'Conta PJ';
  }

  if (context === 'Compartilhado') {
    return 'Conta pessoal';
  }

  return 'Conta pessoal';
}

export function buildMovementFromDraft(draft: DraftEntry): Movement {
  return {
    id: makeId('mv'),
    title: draft.title,
    amount: draft.amount,
    type: draft.type,
    context: draft.context ?? 'Pessoal',
    source: 'IA',
    createdAt: `${draft.occurredAt ?? inferOccurrenceDate('')}T12:00:00.000Z`,
    account: resolveMovementAccount(draft.context ?? 'Pessoal'),
    walletAccountId: draft.walletAccountId ?? null,
    cardId: draft.cardId ?? null,
    category: draft.category ?? 'Outros',
  };
}
