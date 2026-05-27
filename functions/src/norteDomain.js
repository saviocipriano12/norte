export const today = () => new Date().toISOString().slice(0, 10)

export const normalizeText = (text = '') =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const createId = () =>
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`

export const getDefaultAccountId = (accounts = [], scope) =>
  accounts.find((account) => account.scope === scope)?.id ||
  accounts.find((account) => account.scope === 'both')?.id ||
  accounts[0]?.id ||
  ''

export function applySaleOperation(data, input) {
  const item = data.catalog.find((catalogItem) => catalogItem.id === input.itemId) || data.catalog[0]
  const quantity = Number(input.quantity || 1)
  const unitPrice = Number(input.unitPrice || item?.price || 0)
  const total = quantity * unitPrice
  if (!input.clientName || !item || !total) throw new Error('Venda inválida')

  const sale = {
    id: input.id || createId(),
    clientName: input.clientName,
    itemId: item.id,
    itemName: item.name,
    quantity,
    unitPrice,
    total,
    status: input.status,
    date: input.date || today(),
    due: input.due || input.date || today(),
    notes: input.notes || '',
  }

  const clients = data.clients || []
  const existingClient = clients.find((client) => normalizeText(client.name) === normalizeText(sale.clientName))
  const nextClients = existingClient
    ? clients.map((client) =>
        client.id === existingClient.id && sale.status === 'pending'
          ? { ...client, receivable: Number(client.receivable || 0) + total, due: sale.due, status: 'pending' }
          : client,
      )
    : [
        ...clients,
        {
          id: createId(),
          name: sale.clientName,
          phone: '',
          receivable: sale.status === 'pending' ? total : 0,
          due: sale.due,
          status: sale.status === 'pending' ? 'pending' : 'active',
          notes: 'Criado a partir de venda',
        },
      ]

  const nextCatalog = data.catalog.map((catalogItem) => {
    if (catalogItem.id !== item.id || catalogItem.stock === null) return catalogItem
    return { ...catalogItem, stock: Math.max(0, Number(catalogItem.stock || 0) - quantity) }
  })

  const transaction =
    sale.status === 'paid'
      ? {
          id: createId(),
          type: 'income',
          scope: 'business',
          kind: item.type === 'service' ? 'service' : 'sale',
          title: sale.itemName,
          category: item.type === 'service' ? 'Serviço' : 'Venda',
          amount: total,
          date: sale.date,
          accountId: getDefaultAccountId(data.accounts, 'business'),
          quantity,
          itemName: sale.itemName,
          note: `Venda para ${sale.clientName}`,
          source: 'sale',
          saleId: sale.id,
        }
      : null

  const bill =
    sale.status === 'pending'
      ? {
          id: createId(),
          title: `Receber ${sale.clientName}`,
          scope: 'business',
          type: 'receivable',
          amount: total,
          due: sale.due,
          status: 'open',
          category: 'Recebimento',
          saleId: sale.id,
        }
      : null

  return {
    ...data,
    sales: [sale, ...(data.sales || [])],
    clients: nextClients,
    catalog: nextCatalog,
    transactions: transaction ? [transaction, ...(data.transactions || [])] : data.transactions || [],
    bills: bill ? [bill, ...(data.bills || [])] : data.bills || [],
  }
}

export function applyPurchaseOperation(data, input) {
  const item = data.catalog.find((catalogItem) => catalogItem.id === input.itemId) || data.catalog[0]
  const quantity = Number(input.quantity || 1)
  const unitCost = Number(input.unitCost || item?.cost || 0)
  const total = quantity * unitCost
  if (!input.supplierName || !item || !total) throw new Error('Compra inválida')

  const purchase = {
    id: input.id || createId(),
    supplierName: input.supplierName,
    itemId: item.id,
    itemName: item.name,
    quantity,
    unitCost,
    total,
    status: input.status,
    date: input.date || today(),
    due: input.due || input.date || today(),
    notes: input.notes || '',
  }

  const suppliers = data.suppliers || []
  const existingSupplier = suppliers.find((supplier) => normalizeText(supplier.name) === normalizeText(purchase.supplierName))
  const nextSuppliers = existingSupplier
    ? suppliers.map((supplier) =>
        supplier.id === existingSupplier.id && purchase.status === 'pending'
          ? { ...supplier, payable: Number(supplier.payable || 0) + total }
          : supplier,
      )
    : [
        ...suppliers,
        {
          id: createId(),
          name: purchase.supplierName,
          phone: '',
          payable: purchase.status === 'pending' ? total : 0,
          notes: 'Criado a partir de compra',
        },
      ]

  const nextCatalog = data.catalog.map((catalogItem) => {
    if (catalogItem.id !== item.id || catalogItem.stock === null) return catalogItem
    return { ...catalogItem, stock: Number(catalogItem.stock || 0) + quantity, cost: unitCost }
  })

  const transaction =
    purchase.status === 'paid'
      ? {
          id: createId(),
          type: 'expense',
          scope: 'business',
          kind: 'purchase',
          title: purchase.itemName,
          category: item.type === 'material' ? 'Material' : 'Mercadoria',
          amount: total,
          date: purchase.date,
          accountId: getDefaultAccountId(data.accounts, 'business'),
          quantity,
          itemName: purchase.itemName,
          note: `Compra de ${purchase.supplierName}`,
          source: 'purchase',
          purchaseId: purchase.id,
        }
      : null

  const bill =
    purchase.status === 'pending'
      ? {
          id: createId(),
          title: `Pagar ${purchase.supplierName}`,
          scope: 'business',
          type: 'payable',
          amount: total,
          due: purchase.due,
          status: 'open',
          category: item.type === 'material' ? 'Material' : 'Mercadoria',
          purchaseId: purchase.id,
        }
      : null

  return {
    ...data,
    purchases: [purchase, ...(data.purchases || [])],
    suppliers: nextSuppliers,
    catalog: nextCatalog,
    transactions: transaction ? [transaction, ...(data.transactions || [])] : data.transactions || [],
    bills: bill ? [bill, ...(data.bills || [])] : data.bills || [],
  }
}

export function cancelSaleOperation(data, saleId) {
  const sale = (data.sales || []).find((item) => item.id === saleId)
  if (!sale) throw new Error('Venda não encontrada')

  const catalog = (data.catalog || []).map((item) =>
    item.id === sale.itemId && item.stock !== null
      ? { ...item, stock: Number(item.stock || 0) + Number(sale.quantity || 0) }
      : item,
  )

  const clients = (data.clients || []).map((client) => {
    if (normalizeText(client.name) !== normalizeText(sale.clientName) || sale.status !== 'pending') return client
    const receivable = Math.max(0, Number(client.receivable || 0) - Number(sale.total || 0))
    return { ...client, receivable, status: receivable > 0 ? 'pending' : 'active' }
  })

  return {
    ...data,
    sales: (data.sales || []).filter((item) => item.id !== saleId),
    catalog,
    clients,
    transactions: (data.transactions || []).filter((item) => item.saleId !== saleId),
    bills: (data.bills || []).filter((item) => item.saleId !== saleId),
  }
}

export function cancelPurchaseOperation(data, purchaseId) {
  const purchase = (data.purchases || []).find((item) => item.id === purchaseId)
  if (!purchase) throw new Error('Compra não encontrada')

  const catalog = (data.catalog || []).map((item) =>
    item.id === purchase.itemId && item.stock !== null
      ? { ...item, stock: Math.max(0, Number(item.stock || 0) - Number(purchase.quantity || 0)) }
      : item,
  )

  const suppliers = (data.suppliers || []).map((supplier) => {
    if (normalizeText(supplier.name) !== normalizeText(purchase.supplierName) || purchase.status !== 'pending') return supplier
    return { ...supplier, payable: Math.max(0, Number(supplier.payable || 0) - Number(purchase.total || 0)) }
  })

  return {
    ...data,
    purchases: (data.purchases || []).filter((item) => item.id !== purchaseId),
    catalog,
    suppliers,
    transactions: (data.transactions || []).filter((item) => item.purchaseId !== purchaseId),
    bills: (data.bills || []).filter((item) => item.purchaseId !== purchaseId),
  }
}
