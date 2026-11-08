import { addDaysISO, addMonthsISO, todayISO } from '@/lib/format'
import { invoiceItemsToPayload } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import { fetchAllPages } from '@/services/serviceUtils'
import type { Json } from '@/types/database'
import type {
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

export const invoiceService = {
  async list(filters: InvoiceListFilters = {}): Promise<InvoiceListResult> {
    const client = getSupabase()
    const page = Math.max(filters.page ?? 1, 1)
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 200)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = client
      .from('invoice_summary')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)

    const search = sanitizeSearch(filters.search ?? '')
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

    const { column, ascending } = sortConfig(filters.sort)
    query = query
      .order(column, { ascending })
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    return {
      rows: (data ?? []) as InvoiceSummary[],
      total: count ?? 0,
    }
  },

  async getFull(id: string): Promise<InvoiceFull | null> {
    const client = getSupabase()
    const [invoiceResult, itemsResult, paymentsResult] = await Promise.all([
      client.from('invoice_summary').select('*').eq('id', id).maybeSingle(),
      client.from('invoice_items').select('*').eq('invoice_id', id).order('position', { ascending: true }),
      client
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (invoiceResult.error) throw invoiceResult.error
    if (itemsResult.error) throw itemsResult.error
    if (paymentsResult.error) throw paymentsResult.error
    if (!invoiceResult.data) return null

    const invoice = invoiceResult.data as InvoiceSummary
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
      payments: (paymentsResult.data ?? []) as Payment[],
      customer,
    }
  },

  async generateNumber(): Promise<string> {
    const client = getSupabase()
    const { data, error } = await client.rpc('generate_invoice_number')
    if (error) throw error
    return data as string
  },

  async save(payload: InvoicePayload): Promise<string> {
    const client = getSupabase()
    const { data, error } = await client.rpc('save_invoice', {
      payload: payload as unknown as Json,
    })
    if (error) throw error
    return data as string
  },

  async setStatus(id: string, status: InvoiceStatus): Promise<void> {
    const client = getSupabase()
    const { error } = await client
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) throw error
  },

  async softDelete(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client
      .from('invoices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async restore(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client.from('invoices').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  },

  async permanentlyDelete(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client.from('invoices').delete().eq('id', id)
    if (error) throw error
  },

  async listDeleted(): Promise<InvoiceSummary[]> {
    const client = getSupabase()
    const { data, error } = await client
      .from('invoice_summary')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as InvoiceSummary[]
  },

  async count(includeDeleted = false): Promise<number> {
    const client = getSupabase()
    let query = client.from('invoices').select('id', { count: 'exact', head: true })
    if (!includeDeleted) query = query.is('deleted_at', null)
    const { count, error } = await query
    if (error) throw error
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
    const client = getSupabase()
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
