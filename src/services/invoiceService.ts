import { addDaysISO, addMonthsISO, toNumber, todayISO } from '@/lib/format'
import {
  DEFAULT_PAYMENT_TERMS,
  MAX_INVOICE_ITEMS,
  businessSnapshotFromSettings,
  calculateDisplayTotals,
  formatInvoiceNumberPreview,
  invoiceItemsToPayload,
  roundMoney,
} from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  activateLocalWorkspace,
  createUuid,
  fetchAllPages,
  fetchInvoiceSummariesFallback,
  getCurrentUserId,
  isLocalWorkspaceActive,
  isRlsOrPermissionError,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
  readLocalWorkspace,
  toInvoiceSummary,
  writeLocalWorkspace,
} from '@/services/serviceUtils'
import { settingsService } from '@/services/settingsService'
import type { Json } from '@/types/database'
import type {
  Invoice,
  InvoiceFull,
  InvoiceItem,
  InvoiceListFilters,
  InvoiceListResult,
  InvoicePayload,
  InvoiceStatus,
  InvoiceSummary,
  Payment,
  PaymentStatus,
  Settings,
} from '@/types/models'

function sanitizeSearch(value: string): string {
  return value.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function sortConfig(sort: InvoiceListFilters['sort']) {
  switch (sort) {
    case 'date_asc':
      return { column: 'invoice_date' as const, ascending: true }
    case 'amount_desc':
      return { column: 'total' as const, ascending: false }
    case 'amount_asc':
      return { column: 'total' as const, ascending: true }
    case 'date_desc':
    default:
      return { column: 'invoice_date' as const, ascending: false }
  }
}

async function generateInvoiceNumberFallback(): Promise<string> {
  const settings = await settingsService.getOrCreate()
  const seq = Math.max(settings.next_invoice_seq || 1, 1)

  await settingsService.update({ next_invoice_seq: seq + 1 })
  return formatInvoiceNumberPreview(settings, seq, new Date().getFullYear())
}

function saveInvoiceToLocalWorkspace(
  userId: string,
  payload: InvoicePayload,
  settings: Settings,
): string {
  const ws = activateLocalWorkspace(userId)
  const prevId = payload.id?.trim() || null
  const now = new Date().toISOString()

  let existing = prevId ? ws.invoices.find((i) => i.id === prevId && !i.deleted_at) : null
  if (prevId && !existing) {
    throw new Error('Invoice not found, or it is in the trash.')
  }

  let invoiceNumber =
    payload.invoice_number !== undefined
      ? payload.invoice_number.trim()
      : (existing?.invoice_number ?? '')
  if (!invoiceNumber) {
    const seq = Math.max(ws.settings.next_invoice_seq || 1, 1)
    ws.settings.next_invoice_seq = seq + 1
    ws.settings.updated_at = now
    invoiceNumber = formatInvoiceNumberPreview(ws.settings, seq, new Date().getFullYear())
  }

  const customerId =
    payload.customer_id !== undefined
      ? payload.customer_id || null
      : (existing?.customer_id ?? null)

  let customerName = (payload.customer_name ?? '').trim()
  if (customerId) {
    const customer = ws.customers.find((c) => c.id === customerId)
    if (!customer) {
      throw new Error('The selected customer could not be found.')
    }
    customerName = customerName || existing?.customer_name || customer.name
  } else {
    customerName = customerName || existing?.customer_name || ''
  }

  const invoiceDate = payload.invoice_date || existing?.invoice_date || todayISO()
  const dueDate = payload.due_date || existing?.due_date || addDaysISO(invoiceDate, 7)

  if (dueDate < invoiceDate) {
    throw new Error('The due date cannot be before the invoice date.')
  }

  const status: InvoiceStatus =
    (payload.status || (existing?.status as InvoiceStatus) || 'draft') === 'final'
      ? 'final'
      : 'draft'

  if (status === 'final' && !customerName) {
    throw new Error('Please choose a customer before saving a final invoice.')
  }

  const projectName =
    payload.project_name !== undefined
      ? payload.project_name.trim() || null
      : (existing?.project_name ?? null)

  const notes =
    payload.notes !== undefined ? payload.notes.trim() || null : (existing?.notes ?? null)

  const paymentTerms =
    (payload.payment_terms !== undefined
      ? payload.payment_terms.trim()
      : existing?.payment_terms) ||
    settings.default_payment_terms ||
    DEFAULT_PAYMENT_TERMS

  const hasPayloadSnapshot =
    payload.business_snapshot &&
    typeof payload.business_snapshot === 'object' &&
    !Array.isArray(payload.business_snapshot) &&
    Object.keys(payload.business_snapshot).length > 0

  const businessSnapshot = (
    hasPayloadSnapshot
      ? payload.business_snapshot
      : existing?.business_snapshot &&
          typeof existing.business_snapshot === 'object' &&
          !Array.isArray(existing.business_snapshot) &&
          Object.keys(existing.business_snapshot).length > 0
        ? existing.business_snapshot
        : businessSnapshotFromSettings(settings)
  ) as Json

  const discountAmount =
    payload.discount_amount !== undefined
      ? roundMoney(toNumber(payload.discount_amount))
      : roundMoney(toNumber(existing?.discount_amount))
  const taxRate =
    payload.tax_rate !== undefined
      ? roundMoney(toNumber(payload.tax_rate))
      : roundMoney(toNumber(existing?.tax_rate))

  if (discountAmount < 0) {
    throw new Error('The discount cannot be negative.')
  }
  if (taxRate < 0 || taxRate > 100) {
    throw new Error('The tax rate must be between 0 and 100.')
  }

  let effectiveItems = payload.items
  if (!effectiveItems && prevId) {
    effectiveItems = ws.invoice_items
      .filter((item) => item.invoice_id === prevId)
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        unit: toNumber(item.unit),
        price: toNumber(item.price),
      }))
  }

  const compactItems = (effectiveItems ?? []).filter(
    (item) => (item.description ?? '').trim() !== '' || toNumber(item.price) !== 0,
  )

  if (compactItems.length > MAX_INVOICE_ITEMS) {
    throw new Error('An invoice can have at most 14 line items.')
  }

  const totals = calculateDisplayTotals(compactItems, {
    discountAmount,
    taxRate,
    discountEnabled: settings.discount_enabled,
    taxEnabled: settings.tax_enabled,
  })

  if (prevId) {
    const paidTotal = roundMoney(
      ws.payments
        .filter((p) => p.invoice_id === prevId)
        .reduce((sum, p) => sum + toNumber(p.amount), 0),
    )
    if (paidTotal > totals.total) {
      throw new Error(
        'The invoice total cannot be lower than its recorded payments. Remove or adjust payments first.',
      )
    }
  }

  let invoiceId = prevId
  if (!invoiceId) {
    invoiceId = createUuid()
    ws.invoices.push({
      id: invoiceId,
      user_id: userId,
      invoice_number: invoiceNumber,
      customer_id: customerId,
      customer_name: customerName,
      project_name: projectName,
      invoice_date: invoiceDate,
      due_date: dueDate,
      status,
      notes,
      payment_terms: paymentTerms,
      business_snapshot: businessSnapshot,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      subtotal: totals.subtotal,
      total: totals.total,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    })
  } else {
    const target = ws.invoices.find((i) => i.id === invoiceId)!
    target.invoice_number = invoiceNumber
    target.customer_id = customerId
    target.customer_name = customerName
    target.project_name = projectName
    target.invoice_date = invoiceDate
    target.due_date = dueDate
    target.status = status
    target.notes = notes
    target.payment_terms = paymentTerms
    target.business_snapshot = businessSnapshot
    target.discount_amount = discountAmount
    target.tax_rate = taxRate
    target.subtotal = totals.subtotal
    target.total = totals.total
    target.updated_at = now
  }

  if (payload.items !== undefined) {
    ws.invoice_items = ws.invoice_items.filter((item) => item.invoice_id !== invoiceId)
    compactItems.forEach((item, index) => {
      ws.invoice_items.push({
        id: createUuid(),
        user_id: userId,
        invoice_id: invoiceId!,
        position: index + 1,
        description: item.description ?? '',
        unit: toNumber(item.unit) || 1,
        price: roundMoney(toNumber(item.price)),
        line_total: roundMoney((toNumber(item.unit) || 1) * roundMoney(toNumber(item.price))),
        created_at: now,
        updated_at: now,
      })
    })
  }

  writeLocalWorkspace(userId, ws)
  return invoiceId
}

async function saveInvoiceFallback(payload: InvoicePayload): Promise<string> {
  const userId = await getCurrentUserId()
  const settings = await settingsService.getOrCreate()

  if (isLocalWorkspaceActive(userId)) {
    return saveInvoiceToLocalWorkspace(userId, payload, settings)
  }

  const client = getSupabase()
  const prevId = payload.id?.trim() || null

  let existing: Invoice | null = null
  if (prevId) {
    const { data, error } = await client
      .from('invoices')
      .select('*')
      .eq('id', prevId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) {
      if (isRlsOrPermissionError(error)) {
        return saveInvoiceToLocalWorkspace(userId, payload, settings)
      }
      throw error
    }
    if (!data) {
      throw new Error('Invoice not found, or it is in the trash.')
    }
    existing = data as Invoice
  }

  let invoiceNumber =
    payload.invoice_number !== undefined
      ? payload.invoice_number.trim()
      : (existing?.invoice_number ?? '')
  if (!invoiceNumber) {
    invoiceNumber = await invoiceService.generateNumber()
  }

  const customerId =
    payload.customer_id !== undefined
      ? payload.customer_id || null
      : (existing?.customer_id ?? null)

  let customerName = (payload.customer_name ?? '').trim()
  if (customerId) {
    const { data: customerRow, error: customerError } = await client
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customerRow) {
      throw new Error('The selected customer could not be found.')
    }
    customerName = customerName || existing?.customer_name || customerRow.name
  } else {
    customerName = customerName || existing?.customer_name || ''
  }

  const invoiceDate = payload.invoice_date || existing?.invoice_date || todayISO()
  const dueDate = payload.due_date || existing?.due_date || addDaysISO(invoiceDate, 7)

  if (dueDate < invoiceDate) {
    throw new Error('The due date cannot be before the invoice date.')
  }

  const status: InvoiceStatus =
    (payload.status || (existing?.status as InvoiceStatus) || 'draft') === 'final'
      ? 'final'
      : 'draft'

  if (status === 'final' && !customerName) {
    throw new Error('Please choose a customer before saving a final invoice.')
  }

  const projectName =
    payload.project_name !== undefined
      ? payload.project_name.trim() || null
      : (existing?.project_name ?? null)

  const notes =
    payload.notes !== undefined ? payload.notes.trim() || null : (existing?.notes ?? null)

  const paymentTerms =
    (payload.payment_terms !== undefined
      ? payload.payment_terms.trim()
      : existing?.payment_terms) ||
    settings.default_payment_terms ||
    DEFAULT_PAYMENT_TERMS

  const hasPayloadSnapshot =
    payload.business_snapshot &&
    typeof payload.business_snapshot === 'object' &&
    !Array.isArray(payload.business_snapshot) &&
    Object.keys(payload.business_snapshot).length > 0

  const businessSnapshot = (
    hasPayloadSnapshot
      ? payload.business_snapshot
      : existing?.business_snapshot &&
          typeof existing.business_snapshot === 'object' &&
          !Array.isArray(existing.business_snapshot) &&
          Object.keys(existing.business_snapshot).length > 0
        ? existing.business_snapshot
        : businessSnapshotFromSettings(settings)
  ) as Json

  const discountAmount =
    payload.discount_amount !== undefined
      ? roundMoney(toNumber(payload.discount_amount))
      : roundMoney(toNumber(existing?.discount_amount))
  const taxRate =
    payload.tax_rate !== undefined
      ? roundMoney(toNumber(payload.tax_rate))
      : roundMoney(toNumber(existing?.tax_rate))

  if (discountAmount < 0) {
    throw new Error('The discount cannot be negative.')
  }
  if (taxRate < 0 || taxRate > 100) {
    throw new Error('The tax rate must be between 0 and 100.')
  }

  let effectiveItems = payload.items
  if (!effectiveItems && prevId) {
    const { data: prevItems, error: prevItemsError } = await client
      .from('invoice_items')
      .select('description, unit, price, position')
      .eq('invoice_id', prevId)
      .order('position', { ascending: true })
    if (prevItemsError) throw prevItemsError
    effectiveItems = (prevItems ?? []).map((item) => ({
      description: item.description,
      unit: toNumber(item.unit),
      price: toNumber(item.price),
    }))
  }

  const compactItems = (effectiveItems ?? []).filter(
    (item) => (item.description ?? '').trim() !== '' || toNumber(item.price) !== 0,
  )

  if (compactItems.length > MAX_INVOICE_ITEMS) {
    throw new Error('An invoice can have at most 14 line items.')
  }

  const totals = calculateDisplayTotals(compactItems, {
    discountAmount,
    taxRate,
    discountEnabled: settings.discount_enabled,
    taxEnabled: settings.tax_enabled,
  })

  if (prevId) {
    const { data: existingPayments, error: paymentsError } = await client
      .from('payments')
      .select('amount')
      .eq('invoice_id', prevId)
    if (paymentsError) throw paymentsError
    const paidTotal = roundMoney(
      (existingPayments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0),
    )
    if (paidTotal > totals.total) {
      throw new Error(
        'The invoice total cannot be lower than its recorded payments. Remove or adjust payments first.',
      )
    }
  }

  let invoiceId = prevId
  try {
    if (!invoiceId) {
      const { data: inserted, error: insertError } = await client
        .from('invoices')
        .insert({
          user_id: userId,
          invoice_number: invoiceNumber,
          customer_id: customerId,
          customer_name: customerName,
          project_name: projectName,
          invoice_date: invoiceDate,
          due_date: dueDate,
          status,
          notes,
          payment_terms: paymentTerms,
          business_snapshot: businessSnapshot,
          discount_amount: discountAmount,
          tax_rate: taxRate,
          subtotal: totals.subtotal,
          total: totals.total,
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      invoiceId = inserted.id
    } else {
      const { error: updateError } = await client
        .from('invoices')
        .update({
          invoice_number: invoiceNumber,
          customer_id: customerId,
          customer_name: customerName,
          project_name: projectName,
          invoice_date: invoiceDate,
          due_date: dueDate,
          status,
          notes,
          payment_terms: paymentTerms,
          business_snapshot: businessSnapshot,
          discount_amount: discountAmount,
          tax_rate: taxRate,
          subtotal: totals.subtotal,
          total: totals.total,
        })
        .eq('id', invoiceId)
        .is('deleted_at', null)
      if (updateError) throw updateError
    }

    if (!invoiceId) {
      throw new Error('Failed to resolve invoice ID')
    }
    const resolvedInvoiceId = invoiceId

    if (payload.items !== undefined) {
      const { error: deleteItemsError } = await client
        .from('invoice_items')
        .delete()
        .eq('invoice_id', resolvedInvoiceId)
      if (deleteItemsError) throw deleteItemsError

      if (compactItems.length > 0) {
        const rowsToInsert = compactItems.map((item, index) => ({
          user_id: userId,
          invoice_id: resolvedInvoiceId,
          position: index + 1,
          description: item.description ?? '',
          unit: toNumber(item.unit) || 1,
          price: roundMoney(toNumber(item.price)),
        }))
        const { error: insertItemsError } = await client.from('invoice_items').insert(rowsToInsert)
        if (insertItemsError) throw insertItemsError
      }

      const { error: finalTotalsError } = await client
        .from('invoices')
        .update({
          subtotal: totals.subtotal,
          total: totals.total,
        })
        .eq('id', resolvedInvoiceId)
      if (finalTotalsError) throw finalTotalsError
    }

    return resolvedInvoiceId
  } catch (error) {
    if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
      return saveInvoiceToLocalWorkspace(userId, payload, settings)
    }
    throw error
  }
}

export const invoiceService = {
  async list(filters: InvoiceListFilters = {}): Promise<InvoiceListResult> {
    const userId = await getCurrentUserId()
    const page = Math.max(filters.page ?? 1, 1)
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 200)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const search = sanitizeSearch(filters.search ?? '')
    const { column, ascending } = sortConfig(filters.sort)

    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
      let query = client
        .from('invoice_summary')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)

      if (search) {
        query = query.or(`invoice_number.ilike.%${search}%,customer_name.ilike.%${search}%`)
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('payment_status', filters.status)
      }
      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId)
      }
      if (filters.from) query = query.gte('invoice_date', filters.from)
      if (filters.to) query = query.lte('invoice_date', filters.to)

      query = query
        .order(column, { ascending })
        .order('created_at', { ascending: false })
        .range(from, to)

      const { data, error, count } = await query
      if (!error) {
        return {
          rows: (data ?? []) as InvoiceSummary[],
          total: count ?? 0,
        }
      }
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('invoice_summary')
    }

    let rows = await fetchInvoiceSummariesFallback()
    if (search) {
      const needle = search.toLowerCase()
      rows = rows.filter(
        (row) =>
          row.invoice_number.toLowerCase().includes(needle) ||
          row.customer_name.toLowerCase().includes(needle),
      )
    }
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((row) => row.payment_status === filters.status)
    }
    if (filters.customerId) {
      rows = rows.filter((row) => row.customer_id === filters.customerId)
    }
    if (filters.from) {
      rows = rows.filter((row) => row.invoice_date >= filters.from!)
    }
    if (filters.to) {
      rows = rows.filter((row) => row.invoice_date <= filters.to!)
    }

    rows.sort((a, b) => {
      let cmp = 0
      if (column === 'total') {
        cmp = toNumber(a.total) - toNumber(b.total)
      } else {
        cmp = a.invoice_date.localeCompare(b.invoice_date)
      }
      if (!ascending) cmp = -cmp
      if (cmp !== 0) return cmp
      return b.created_at.localeCompare(a.created_at)
    })

    return {
      rows: rows.slice(from, to + 1),
      total: rows.length,
    }
  },

  async getFull(id: string): Promise<InvoiceFull | null> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const raw = ws.invoices.find((inv) => inv.id === id)
      if (!raw) return null
      const items = ws.invoice_items
        .filter((item) => item.invoice_id === id)
        .sort((a, b) => a.position - b.position)
      const payments = ws.payments
        .filter((p) => p.invoice_id === id)
        .sort((a, b) => {
          const cmp = b.paid_on.localeCompare(a.paid_on)
          if (cmp !== 0) return cmp
          return b.created_at.localeCompare(a.created_at)
        })
      const paidAmount = roundMoney(payments.reduce((sum, p) => sum + toNumber(p.amount), 0))
      const summary = toInvoiceSummary(raw, paidAmount)
      const customer = raw.customer_id
        ? ws.customers.find((c) => c.id === raw.customer_id) ?? null
        : null

      return {
        ...summary,
        items,
        payments,
        customer,
      }
    }

    const client = getSupabase()
    try {
      const [itemsResult, paymentsResult] = await Promise.all([
        client
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', id)
          .order('position', { ascending: true }),
        client
          .from('payments')
          .select('*')
          .eq('invoice_id', id)
          .order('paid_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      if (itemsResult.error) throw itemsResult.error
      if (paymentsResult.error) throw paymentsResult.error

      const payments = (paymentsResult.data ?? []) as Payment[]
      let invoice: InvoiceSummary | null = null

      if (isSchemaFeatureAvailable('invoice_summary')) {
        const invoiceResult = await client
          .from('invoice_summary')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (!invoiceResult.error) {
          invoice = (invoiceResult.data as InvoiceSummary | null) ?? null
        } else if (isSchemaCacheMissingError(invoiceResult.error)) {
          markSchemaFeatureUnavailable('invoice_summary')
        } else {
          throw invoiceResult.error
        }
      }

      if (!invoice && !isSchemaFeatureAvailable('invoice_summary')) {
        const rawInvoiceResult = await client
          .from('invoices')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (rawInvoiceResult.error) throw rawInvoiceResult.error
        if (rawInvoiceResult.data) {
          const paidAmount = roundMoney(
            payments.reduce((sum, p) => sum + toNumber(p.amount), 0),
          )
          invoice = toInvoiceSummary(rawInvoiceResult.data as Invoice, paidAmount)
        }
      }

      if (!invoice) return null

      let customer = null
      if (invoice.customer_id) {
        const customerResult = await client
          .from('customers')
          .select('*')
          .eq('id', invoice.customer_id)
          .maybeSingle()
        if (customerResult.error) throw customerResult.error
        customer = customerResult.data
      }

      return {
        ...invoice,
        items: (itemsResult.data ?? []) as InvoiceItem[],
        payments,
        customer,
      }
    } catch (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const raw = ws.invoices.find((inv) => inv.id === id)
        if (!raw) return null
        const items = ws.invoice_items
          .filter((item) => item.invoice_id === id)
          .sort((a, b) => a.position - b.position)
        const payments = ws.payments
          .filter((p) => p.invoice_id === id)
          .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
        const paidAmount = roundMoney(payments.reduce((sum, p) => sum + toNumber(p.amount), 0))
        const summary = toInvoiceSummary(raw, paidAmount)
        const customer = raw.customer_id
          ? ws.customers.find((c) => c.id === raw.customer_id) ?? null
          : null
        return {
          ...summary,
          items,
          payments,
          customer,
        }
      }
      throw error
    }
  },

  async generateNumber(): Promise<string> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('generate_invoice_number')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('generate_invoice_number')
      if (!error) return data as string
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('generate_invoice_number')
    }

    return generateInvoiceNumberFallback()
  },

  async save(payload: InvoicePayload): Promise<string> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('save_invoice')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('save_invoice', {
        payload: payload as unknown as Json,
      })
      if (!error) return data as string
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('save_invoice')
    }

    return saveInvoiceFallback(payload)
  },

  async setStatus(id: string, status: InvoiceStatus): Promise<void> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.invoices.find((inv) => inv.id === id)
      if (target) {
        target.status = status
        target.updated_at = new Date().toISOString()
        writeLocalWorkspace(userId, ws)
      }
      return
    }

    const client = getSupabase()
    const { error } = await client
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.invoices.find((inv) => inv.id === id)
        if (target) {
          target.status = status
          target.updated_at = new Date().toISOString()
          writeLocalWorkspace(userId, ws)
        }
        return
      }
      throw error
    }
  },

  async softDelete(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.invoices.find((inv) => inv.id === id)
      if (target) {
        target.deleted_at = now
        target.updated_at = now
        writeLocalWorkspace(userId, ws)
      }
      return
    }

    const client = getSupabase()
    const { error } = await client
      .from('invoices')
      .update({ deleted_at: now })
      .eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.invoices.find((inv) => inv.id === id)
        if (target) {
          target.deleted_at = now
          target.updated_at = now
          writeLocalWorkspace(userId, ws)
        }
        return
      }
      throw error
    }
  },

  async restore(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.invoices.find((inv) => inv.id === id)
      if (target) {
        target.deleted_at = null
        target.updated_at = now
        writeLocalWorkspace(userId, ws)
      }
      return
    }

    const client = getSupabase()
    const { error } = await client.from('invoices').update({ deleted_at: null }).eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.invoices.find((inv) => inv.id === id)
        if (target) {
          target.deleted_at = null
          target.updated_at = now
          writeLocalWorkspace(userId, ws)
        }
        return
      }
      throw error
    }
  },

  async permanentlyDelete(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      ws.invoices = ws.invoices.filter((inv) => inv.id !== id)
      ws.invoice_items = ws.invoice_items.filter((item) => item.invoice_id !== id)
      ws.payments = ws.payments.filter((p) => p.invoice_id !== id)
      writeLocalWorkspace(userId, ws)
      return
    }

    const client = getSupabase()
    const { error } = await client.from('invoices').delete().eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        ws.invoices = ws.invoices.filter((inv) => inv.id !== id)
        ws.invoice_items = ws.invoice_items.filter((item) => item.invoice_id !== id)
        ws.payments = ws.payments.filter((p) => p.invoice_id !== id)
        writeLocalWorkspace(userId, ws)
        return
      }
      throw error
    }
  },

  async listDeleted(): Promise<InvoiceSummary[]> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
      const { data, error } = await client
        .from('invoice_summary')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (!error) return (data ?? []) as InvoiceSummary[]
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('invoice_summary')
    }

    const rows = await fetchInvoiceSummariesFallback({ onlyDeleted: true })
    return rows.sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''))
  },

  async count(includeDeleted = false): Promise<number> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const filtered = includeDeleted ? ws.invoices : ws.invoices.filter((i) => !i.deleted_at)
      return filtered.length
    }

    const client = getSupabase()
    let query = client.from('invoices').select('id', { count: 'exact', head: true })
    if (!includeDeleted) query = query.is('deleted_at', null)
    const { count, error } = await query
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const filtered = includeDeleted ? ws.invoices : ws.invoices.filter((i) => !i.deleted_at)
        return filtered.length
      }
      throw error
    }
    return count ?? 0
  },

  async duplicate(id: string, settings: Settings): Promise<string> {
    const source = await invoiceService.getFull(id)
    if (!source) throw new Error('Invoice not found.')
    const number = await invoiceService.generateNumber()
    const date = todayISO()
    return invoiceService.save({
      invoice_number: number,
      customer_id: source.customer_id,
      customer_name: source.customer_name,
      project_name: source.project_name ?? '',
      invoice_date: date,
      due_date: addDaysISO(date, settings.default_due_days),
      status: 'draft',
      notes: source.notes ?? '',
      payment_terms: source.payment_terms ?? settings.default_payment_terms,
      business_snapshot: source.business_snapshot,
      discount_amount: source.discount_amount,
      tax_rate: source.tax_rate,
      items: invoiceItemsToPayload(source.items),
    })
  },

  async createNextMonth(id: string, settings: Settings): Promise<string> {
    const source = await invoiceService.getFull(id)
    if (!source) throw new Error('Invoice not found.')
    const number = await invoiceService.generateNumber()
    const nextDate = addMonthsISO(source.invoice_date, 1)
    return invoiceService.save({
      invoice_number: number,
      customer_id: source.customer_id,
      customer_name: source.customer_name,
      project_name: source.project_name ?? '',
      invoice_date: nextDate,
      due_date: addDaysISO(nextDate, settings.default_due_days),
      status: 'draft',
      notes: source.notes ?? '',
      payment_terms: source.payment_terms ?? settings.default_payment_terms,
      business_snapshot: source.business_snapshot,
      discount_amount: source.discount_amount,
      tax_rate: source.tax_rate,
      items: invoiceItemsToPayload(source.items),
    })
  },

  async exportAll(includeDeleted = false): Promise<InvoiceSummary[]> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
      try {
        const rows = await fetchAllPages((from, to) => {
          let query = client
            .from('invoice_summary')
            .select('*')
            .order('invoice_date', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
          if (!includeDeleted) query = query.is('deleted_at', null)
          return query
        })
        return rows as InvoiceSummary[]
      } catch (error) {
        if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
        markSchemaFeatureUnavailable('invoice_summary')
      }
    }

    const rows = await fetchInvoiceSummariesFallback({ includeDeleted })
    return rows.sort((a, b) => {
      const cmp = b.invoice_date.localeCompare(a.invoice_date)
      if (cmp !== 0) return cmp
      return a.id.localeCompare(b.id)
    })
  },
}

export function isPaymentStatus(value: string | null | undefined): value is PaymentStatus {
  return (
    value === 'Draft' ||
    value === 'Unpaid' ||
    value === 'Partially Paid' ||
    value === 'Paid' ||
    value === 'Overdue'
  )
}
