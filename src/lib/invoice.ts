import type { Json } from '@/types/database'
import type {
  BusinessSnapshot,
  Invoice,
  InvoiceItem,
  InvoiceItemPayload,
  InvoicePayload,
  InvoiceSummary,
  Settings,
} from '@/types/models'
import type { InvoiceFormValues } from '@/types/validation'
import { formatDate, toNumber } from './format'

export const MAX_INVOICE_ITEMS = 14

export const DEFAULT_PAYMENT_TERMS =
  'A 40% advance payment is required to confirm the booking and commence work. The remaining 60% is payable upon completion of the agreed services or according to the agreed billing schedule.'

export function businessSnapshotFromSettings(settings: Settings): BusinessSnapshot {
  return {
    business_name: settings.business_name || 'EVOLAIRE',
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    address: settings.address ?? '',
    bank_account_name: settings.bank_account_name ?? '',
    bank_account_number: settings.bank_account_number ?? '',
    bank_name: settings.bank_name ?? '',
    bank_branch: settings.bank_branch ?? '',
    logo_path: settings.logo_path,
  }
}

export function normalizeSnapshot(value: Json | BusinessSnapshot | null | undefined): BusinessSnapshot {
  const record = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >
  const stringValue = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : '')
  return {
    business_name: stringValue('business_name') || 'EVOLAIRE',
    email: stringValue('email'),
    phone: stringValue('phone'),
    address: stringValue('address'),
    bank_account_name: stringValue('bank_account_name'),
    bank_account_number: stringValue('bank_account_number'),
    bank_name: stringValue('bank_name'),
    bank_branch: stringValue('bank_branch'),
    logo_path: typeof record.logo_path === 'string' ? record.logo_path : null,
  }
}

export function formatInvoiceNumberPreview(
  settings: Pick<Settings, 'invoice_prefix' | 'invoice_format' | 'next_invoice_seq'>,
  seq = settings.next_invoice_seq,
  year = new Date().getFullYear(),
): string {
  return (settings.invoice_format || '{prefix}-{year}-{seq}')
    .replaceAll('{prefix}', settings.invoice_prefix || 'EVO')
    .replaceAll('{year}', String(year))
    .replaceAll('{seq}', String(seq).padStart(3, '0'))
}

export function calculateLineTotal(unit: number, price: number): number {
  return roundMoney(toNumber(unit) * toNumber(price))
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface DisplayTotals {
  subtotal: number
  discount: number
  tax: number
  total: number
}

export function calculateDisplayTotals(
  items: Array<{ unit: number; price: number }>,
  options: {
    discountAmount?: number
    taxRate?: number
    discountEnabled?: boolean
    taxEnabled?: boolean
  } = {},
): DisplayTotals {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + toNumber(item.unit) * toNumber(item.price), 0),
  )
  const discount = options.discountEnabled
    ? Math.min(Math.max(toNumber(options.discountAmount), 0), subtotal)
    : 0
  const afterDiscount = subtotal - discount
  const tax = options.taxEnabled
    ? roundMoney((afterDiscount * Math.max(toNumber(options.taxRate), 0)) / 100)
    : 0
  return {
    subtotal,
    discount,
    tax,
    total: roundMoney(afterDiscount + tax),
  }
}

export function padItemsToTemplate<T>(items: T[], filler: T): T[] {
  const padded = items.slice(0, MAX_INVOICE_ITEMS)
  while (padded.length < MAX_INVOICE_ITEMS) padded.push(filler)
  return padded
}

export function buildBusinessSnapshot(
  values: InvoiceFormValues['business'],
  logoPath: string | null,
): BusinessSnapshot {
  return {
    business_name: values.business_name.trim() || 'EVOLAIRE',
    email: values.email.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    bank_account_name: values.bank_account_name.trim(),
    bank_account_number: values.bank_account_number.trim(),
    bank_name: values.bank_name.trim(),
    bank_branch: values.bank_branch.trim(),
    logo_path: logoPath,
  }
}

export function buildInvoicePayload(
  values: InvoiceFormValues,
  settings: Settings,
  options: { id?: string; status?: 'draft' | 'final'; logoPath?: string | null } = {},
): InvoicePayload {
  const status = options.status ?? values.status
  const items: InvoiceItemPayload[] = values.items
    .map((item) => ({
      description: item.description.trim(),
      unit: toNumber(item.unit),
      price: roundMoney(toNumber(item.price)),
    }))
    .filter((item) => item.description !== '' || item.price !== 0)

  return {
    id: options.id,
    invoice_number: values.invoice_number.trim(),
    customer_id: values.customer_id || null,
    customer_name: values.customer_name.trim(),
    project_name: values.project_name.trim(),
    invoice_date: values.invoice_date,
    due_date: values.due_date,
    status,
    notes: values.notes.trim(),
    payment_terms: values.payment_terms.trim(),
    business_snapshot: buildBusinessSnapshot(
      values.business,
      options.logoPath ?? values.business.logo_path ?? null,
    ),
    discount_amount: settings.discount_enabled ? roundMoney(values.discount_amount) : 0,
    tax_rate: settings.tax_enabled ? roundMoney(values.tax_rate) : 0,
    items,
  }
}

export function invoiceToFormValues(
  invoice: Invoice,
  items: InvoiceItem[],
  settings: Settings,
): InvoiceFormValues {
  const snapshot = normalizeSnapshot(invoice.business_snapshot)
  const fillFromSettings = !invoice.business_snapshot || Object.keys(invoice.business_snapshot).length === 0
  const business = fillFromSettings ? businessSnapshotFromSettings(settings) : snapshot

  return {
    status: invoice.status === 'final' ? 'final' : 'draft',
    invoice_number: invoice.invoice_number,
    customer_id: invoice.customer_id,
    customer_name: invoice.customer_name,
    project_name: invoice.project_name ?? '',
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    notes: invoice.notes ?? '',
    payment_terms: invoice.payment_terms ?? settings.default_payment_terms,
    discount_amount: toNumber(invoice.discount_amount),
    tax_rate: toNumber(invoice.tax_rate),
    business: {
      business_name: business.business_name,
      email: business.email,
      phone: business.phone,
      address: business.address,
      bank_account_name: business.bank_account_name,
      bank_account_number: business.bank_account_number,
      bank_name: business.bank_name,
      bank_branch: business.bank_branch,
      logo_path: business.logo_path,
    },
    items:
      items.length > 0
        ? items
            .slice(0, MAX_INVOICE_ITEMS)
            .sort((a, b) => a.position - b.position)
            .map((item) => ({
              description: item.description,
              unit: toNumber(item.unit),
              price: toNumber(item.price),
            }))
        : [{ description: '', unit: 1, price: 0 }],
  }
}

export function invoiceItemsToPayload(items: InvoiceItem[]): InvoiceItemPayload[] {
  return items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      description: item.description,
      unit: toNumber(item.unit),
      price: toNumber(item.price),
    }))
}

export function customerLabel(invoice: Pick<InvoiceSummary, 'customer_name'>): string {
  return invoice.customer_name?.trim() || 'No customer'
}

export function invoiceDateLabel(invoice: Pick<InvoiceSummary, 'invoice_date' | 'due_date'>): string {
  return `${formatDate(invoice.invoice_date)} · due ${formatDate(invoice.due_date)}`
}

export function isInvoiceOverdue(invoice: Pick<InvoiceSummary, 'payment_status'>): boolean {
  return invoice.payment_status === 'Overdue'
}

export function advanceAmount(total: number, percent: number): number {
  return roundMoney((toNumber(total) * Math.min(Math.max(toNumber(percent), 0), 100)) / 100)
}
