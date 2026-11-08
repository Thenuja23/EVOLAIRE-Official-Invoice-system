import { toNumber, todayISO } from '@/lib/format'
import { roundMoney } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import type { Invoice, InvoiceSummary, Payment, PaymentStatus } from '@/types/models'

const EXPORT_PAGE_SIZE = 500

type Page<T> = {
  data: T[] | null
  error: { message: string } | null
}

const schemaFeatureAvailability: Record<string, boolean> = {}

export function isSchemaFeatureAvailable(name: string): boolean {
  return schemaFeatureAvailability[name] !== false
}

export function markSchemaFeatureUnavailable(name: string): void {
  schemaFeatureAvailability[name] = false
}

export function isSchemaCacheMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string; details?: string }
  const code = err.code ?? ''
  const text = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase()
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    text.includes('schema cache') ||
    text.includes('could not find the function') ||
    text.includes('could not find the table')
  )
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < EXPORT_PAGE_SIZE) return rows
  }
}

export function toInvoiceSummary(
  invoice: Invoice,
  paidAmount = 0,
  today = todayISO(),
): InvoiceSummary {
  const subtotal = roundMoney(toNumber(invoice.subtotal))
  const total = roundMoney(toNumber(invoice.total))
  const discount_amount = roundMoney(toNumber(invoice.discount_amount))
  const tax_rate = roundMoney(toNumber(invoice.tax_rate))
  const paid = roundMoney(toNumber(paidAmount))
  const balance = roundMoney(total - paid)

  let payment_status: PaymentStatus
  if (invoice.status === 'draft') {
    payment_status = 'Draft'
  } else if (paid >= total && total > 0) {
    payment_status = 'Paid'
  } else if (invoice.due_date < today && balance > 0) {
    payment_status = 'Overdue'
  } else if (paid > 0) {
    payment_status = 'Partially Paid'
  } else {
    payment_status = 'Unpaid'
  }

  return {
    ...invoice,
    subtotal,
    total,
    discount_amount,
    tax_rate,
    paid,
    balance,
    payment_status,
  }
}

export async function fetchInvoiceSummariesFallback(
  options: { includeDeleted?: boolean; onlyDeleted?: boolean } = {},
): Promise<InvoiceSummary[]> {
  const client = getSupabase()
  const [invoices, payments] = await Promise.all([
    fetchAllPages<Invoice>((from, to) => {
      let query = client
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)

      if (options.onlyDeleted) {
        query = query.not('deleted_at', 'is', null)
      } else if (!options.includeDeleted) {
        query = query.is('deleted_at', null)
      }
      return query
    }),
    fetchAllPages<Pick<Payment, 'invoice_id' | 'amount'>>((from, to) =>
      client
        .from('payments')
        .select('invoice_id, amount')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const paidByInvoice = new Map<string, number>()
  for (const payment of payments) {
    const prev = paidByInvoice.get(payment.invoice_id) ?? 0
    paidByInvoice.set(payment.invoice_id, roundMoney(prev + toNumber(payment.amount)))
  }

  const today = todayISO()
  return invoices.map((invoice) =>
    toInvoiceSummary(invoice, paidByInvoice.get(invoice.id) ?? 0, today),
  )
}
