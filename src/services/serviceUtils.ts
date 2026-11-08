import { formatAmount, toNumber, todayISO } from '@/lib/format'
import { DEFAULT_PAYMENT_TERMS, calculateDisplayTotals, roundMoney } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import type {
  Customer,
  Invoice,
  InvoiceItem,
  InvoiceSummary,
  Payment,
  PaymentStatus,
  Settings,
} from '@/types/models'

const EXPORT_PAGE_SIZE = 500
const LOCAL_WORKSPACE_PREFIX = 'evolaire.workspace.v1'

type Page<T> = {
  data: T[] | null
  error: { message: string } | null
}

export interface LocalWorkspace {
  active: boolean
  settings: Settings
  customers: Customer[]
  invoices: Invoice[]
  invoice_items: InvoiceItem[]
  payments: Payment[]
  logo_data_url: string | null
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

export function isRlsOrPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string; details?: string; statusCode?: string | number }
  const code = String(err.code ?? '')
  const text = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase()
  return (
    code === '42501' ||
    text.includes('row-level security') ||
    text.includes('permission denied') ||
    text.includes('new row violates') ||
    text.includes('violates row-level security')
  )
}

export function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function getCurrentUserId(): Promise<string> {
  try {
    const client = getSupabase()
    const {
      data: { session },
    } = await client.auth.getSession()
    if (session?.user?.id) return session.user.id

    const {
      data: { user },
    } = await client.auth.getUser()
    if (user?.id) return user.id
  } catch {
    // Fall back to a stable local owner key if auth lookup fails.
  }
  return 'local-owner'
}

export function createDefaultSettings(userId: string): Settings {
  const now = new Date().toISOString()
  return {
    id: createUuid(),
    user_id: userId,
    business_name: 'EVOLAIRE',
    logo_path: null,
    email: null,
    phone: null,
    address: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_name: null,
    bank_branch: null,
    default_payment_terms: DEFAULT_PAYMENT_TERMS,
    currency: 'LKR',
    invoice_prefix: 'EVO',
    invoice_format: '{prefix}-{year}-{seq}',
    next_invoice_seq: 1,
    default_due_days: 7,
    advance_percent: 40,
    tax_enabled: false,
    discount_enabled: false,
    created_at: now,
    updated_at: now,
  }
}

function workspaceStorageKey(userId: string): string {
  return `${LOCAL_WORKSPACE_PREFIX}.${userId}`
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage
    }
  } catch {
    // Restricted or headless environment
  }
  return null
}

export function readLocalWorkspace(userId: string): LocalWorkspace {
  const fallback: LocalWorkspace = {
    active: false,
    settings: createDefaultSettings(userId),
    customers: [],
    invoices: [],
    invoice_items: [],
    payments: [],
    logo_data_url: null,
  }

  const storage = getStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(workspaceStorageKey(userId))
    if (!raw) {
      storage.setItem(workspaceStorageKey(userId), JSON.stringify(fallback))
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<LocalWorkspace>
    return {
      active: Boolean(parsed.active),
      settings: parsed.settings
        ? { ...createDefaultSettings(userId), ...parsed.settings, user_id: userId }
        : fallback.settings,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      invoice_items: Array.isArray(parsed.invoice_items) ? parsed.invoice_items : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      logo_data_url: typeof parsed.logo_data_url === 'string' ? parsed.logo_data_url : null,
    }
  } catch {
    return fallback
  }
}

export function writeLocalWorkspace(userId: string, workspace: LocalWorkspace): LocalWorkspace {
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(workspaceStorageKey(userId), JSON.stringify(workspace))
    } catch {
      // Ignore storage quota errors in restricted environments.
    }
  }
  return workspace
}

export function activateLocalWorkspace(userId: string): LocalWorkspace {
  const ws = readLocalWorkspace(userId)
  if (!ws.active) {
    ws.active = true
    writeLocalWorkspace(userId, ws)
  }
  return ws
}

export function isLocalWorkspaceActive(userId: string): boolean {
  const ws = readLocalWorkspace(userId)
  return (
    ws.active ||
    ws.customers.length > 0 ||
    ws.invoices.length > 0 ||
    ws.payments.length > 0
  )
}

export function recalculateLocalInvoiceTotals(ws: LocalWorkspace, invoiceId: string): void {
  const invoice = ws.invoices.find((inv) => inv.id === invoiceId)
  if (!invoice) return

  const items = ws.invoice_items
    .filter((item) => item.invoice_id === invoiceId)
    .sort((a, b) => a.position - b.position)

  const totals = calculateDisplayTotals(items, {
    discountAmount: toNumber(invoice.discount_amount),
    taxRate: toNumber(invoice.tax_rate),
    discountEnabled: ws.settings.discount_enabled,
    taxEnabled: ws.settings.tax_enabled,
  })

  const paid = roundMoney(
    ws.payments
      .filter((p) => p.invoice_id === invoiceId)
      .reduce((sum, p) => sum + toNumber(p.amount), 0),
  )

  if (paid > totals.total) {
    throw new Error(
      'The invoice total cannot be lower than its recorded payments. Remove or adjust payments first.',
    )
  }

  invoice.subtotal = totals.subtotal
  invoice.total = totals.total
  invoice.updated_at = new Date().toISOString()
}

export function validateLocalPaymentWrite(
  ws: LocalWorkspace,
  invoiceId: string,
  amount: number,
  excludePaymentId?: string,
): void {
  const invoice = ws.invoices.find((inv) => inv.id === invoiceId)
  if (!invoice) {
    throw new Error('Invoice not found.')
  }
  if (invoice.deleted_at) {
    throw new Error('You cannot record a payment against an invoice in the trash.')
  }
  const existingPaid = roundMoney(
    ws.payments
      .filter((p) => p.invoice_id === invoiceId && p.id !== excludePaymentId)
      .reduce((sum, p) => sum + toNumber(p.amount), 0),
  )
  const remaining = roundMoney(toNumber(invoice.total) - existingPaid)
  if (amount > remaining + 0.005) {
    throw new Error(
      `Payment would exceed the outstanding balance. Outstanding balance: ${formatAmount(remaining)}.`,
    )
  }
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

export function buildSummariesFromLists(
  invoices: Invoice[],
  payments: Array<Pick<Payment, 'invoice_id' | 'amount'>>,
  options: { includeDeleted?: boolean; onlyDeleted?: boolean } = {},
): InvoiceSummary[] {
  const filteredInvoices = invoices.filter((inv) => {
    if (options.onlyDeleted) return Boolean(inv.deleted_at)
    if (!options.includeDeleted) return !inv.deleted_at
    return true
  })

  const paidByInvoice = new Map<string, number>()
  for (const payment of payments) {
    const prev = paidByInvoice.get(payment.invoice_id) ?? 0
    paidByInvoice.set(payment.invoice_id, roundMoney(prev + toNumber(payment.amount)))
  }

  const today = todayISO()
  return filteredInvoices.map((invoice) =>
    toInvoiceSummary(invoice, paidByInvoice.get(invoice.id) ?? 0, today),
  )
}

export async function fetchInvoiceSummariesFallback(
  options: { includeDeleted?: boolean; onlyDeleted?: boolean } = {},
): Promise<InvoiceSummary[]> {
  const userId = await getCurrentUserId()
  if (isLocalWorkspaceActive(userId)) {
    const ws = readLocalWorkspace(userId)
    return buildSummariesFromLists(ws.invoices, ws.payments, options)
  }

  const client = getSupabase()
  try {
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

    if (invoices.length === 0 && isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      return buildSummariesFromLists(ws.invoices, ws.payments, options)
    }

    return buildSummariesFromLists(invoices, payments, options)
  } catch (error) {
    if (isRlsOrPermissionError(error)) {
      const ws = activateLocalWorkspace(userId)
      return buildSummariesFromLists(ws.invoices, ws.payments, options)
    }
    throw error
  }
}
