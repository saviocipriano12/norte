import { createId, getDefaultAccountId, normalizeText, today } from './norteDomain.js'

export function parseEntryOperation({ text, data, defaultScope = 'business', source = 'smart-input' }) {
  const parts = String(text || '')
    .split(/\s*(?:,|;|\be também\b|\btambém\b|\be\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts
    .map((part) => parseEntryPart({ part, data, defaultScope, source }))
    .filter((item) => item.amount > 0 || item.quantity > 0)
}

function parseEntryPart({ part, data, defaultScope, source }) {
  const cleaned = normalizeText(part)
  const isTransfer = /(transferi|retirei|saquei|movi|mandei)/.test(cleaned)
  const isIncome = /(vendi|recebi|faturei|ganhei|fechei|atendi|fiz)/.test(cleaned)
  const type = isTransfer ? 'transfer' : isIncome ? 'income' : 'expense'
  const scope = inferScope(part, type, defaultScope)
  let { quantity, unit } = extractQuantity(part)
  const itemName = guessItemName(part, type)
  const catalogItem = data?.catalog?.find((item) => normalizeText(item.name) === normalizeText(itemName))
  const amount = extractAmount(part, type === 'income' && catalogItem ? catalogItem.price * quantity : 0)
  if (type === 'expense' && unit === 'un' && quantity === amount) quantity = 1
  const category = inferCategory(part, type, scope)
  const kind =
    type === 'transfer'
      ? 'transfer'
      : type === 'income'
        ? category === 'Serviço'
          ? 'service'
          : 'sale'
        : category === 'Mercadoria' || category === 'Material'
          ? 'purchase'
          : 'expense'

  return {
    id: createId(),
    type,
    scope,
    kind,
    title: itemName,
    category,
    amount,
    date: today(),
    accountId: getDefaultAccountId(data?.accounts, scope),
    quantity,
    unit,
    itemName,
    note: part,
    source,
  }
}

function extractAmount(text, fallback = 0) {
  const cleaned = text.replace(/\./g, '').replace(',', '.')
  const patterns = [
    /r\$\s*(\d+(?:\.\d+)?)/i,
    /por\s*(\d+(?:\.\d+)?)/i,
    /(?:deu|total|valor|custou|recebi|paguei|gastei|vendi)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:reais|real)/i,
  ]
  const match = patterns.map((pattern) => cleaned.match(pattern)).find(Boolean)
  return match ? Number(match[1]) : fallback
}

function extractQuantity(text) {
  const cleaned = normalizeText(text)
  const match = cleaned.match(/(\d+(?:[,.]\d+)?)\s*(kg|quilo|quilos|unidades|unidade|un|pecas|peca|clientes|cliente|atendimentos|atendimento|servicos|servico|horas|hora)?/)
  if (!match) return { quantity: 1, unit: 'un' }
  const unitMap = {
    quilo: 'kg',
    quilos: 'kg',
    unidade: 'un',
    unidades: 'un',
    pecas: 'un',
    peca: 'un',
    clientes: 'clientes',
    cliente: 'cliente',
    atendimentos: 'atendimentos',
    atendimento: 'atendimento',
    servicos: 'serviços',
    servico: 'serviço',
    horas: 'h',
    hora: 'h',
  }
  return {
    quantity: Number(match[1].replace(',', '.')) || 1,
    unit: unitMap[match[2]] || match[2] || 'un',
  }
}

function guessItemName(segment, type) {
  const cleaned = normalizeText(segment)
  const verbs =
    type === 'income'
      ? ['vendi', 'recebi', 'faturei', 'ganhei', 'fechei', 'atendi', 'fiz']
      : ['comprei', 'gastei', 'paguei', 'peguei', 'investi']

  let subject = cleaned
  verbs.forEach((verb) => {
    subject = subject.replace(new RegExp(`\\b${verb}\\b`, 'g'), '')
  })
  subject = subject
    .replace(/r\$\s*\d+(?:[.,]\d+)?/g, '')
    .replace(/\d+(?:[.,]\d+)?\s*(reais|real|kg|quilo|quilos|unidades|unidade|un|pecas|peca|clientes|cliente|atendimentos|atendimento|servicos|servico|horas|hora)?/g, '')
    .replace(/\b(no|na|de|do|da|com|para|por|em|o|a|os|as|um|uma|e)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!subject && cleaned.includes('atendimento')) return 'Atendimento'
  if (!subject && cleaned.includes('servic')) return 'Serviço'
  if (!subject) return type === 'income' ? 'Recebimento' : 'Gasto'
  return subject.charAt(0).toUpperCase() + subject.slice(1)
}

function inferCategory(segment, type, scope) {
  const cleaned = normalizeText(segment)
  if (type === 'transfer') return 'Movimentação'
  if (type === 'income') {
    if (cleaned.includes('servic') || cleaned.includes('atendi')) return 'Serviço'
    if (cleaned.includes('salario')) return 'Salário'
    if (cleaned.includes('recebi')) return 'Recebimento'
    return 'Venda'
  }
  if (cleaned.includes('mercadoria') || cleaned.includes('fornecedor') || cleaned.includes('estoque')) return 'Mercadoria'
  if (cleaned.includes('material') || cleaned.includes('insumo')) return 'Material'
  if (cleaned.includes('almoco') || cleaned.includes('lanche')) return 'Alimentação'
  if (cleaned.includes('gasolina') || cleaned.includes('uber') || cleaned.includes('transporte')) return 'Transporte'
  if (cleaned.includes('internet') || cleaned.includes('aluguel') || cleaned.includes('energia')) return 'Conta fixa'
  if (cleaned.includes('trafego') || cleaned.includes('anuncio') || cleaned.includes('marketing')) return 'Marketing'
  return scope === 'personal' ? 'Casa' : 'Outros gastos'
}

function inferScope(segment, type, defaultScope) {
  const cleaned = normalizeText(segment)
  if (cleaned.includes('pessoal') || cleaned.includes('casa') || cleaned.includes('mercado') || cleaned.includes('familia')) {
    return 'personal'
  }
  if (
    cleaned.includes('negocio') ||
    cleaned.includes('loja') ||
    cleaned.includes('cliente') ||
    cleaned.includes('fornecedor') ||
    cleaned.includes('vendi') ||
    cleaned.includes('servico') ||
    cleaned.includes('projeto') ||
    cleaned.includes('mercadoria')
  ) {
    return 'business'
  }
  return type === 'income' ? 'business' : defaultScope
}
