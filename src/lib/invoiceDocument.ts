import {
  calculateDisplayTotals,
  normalizeSnapshot,
  roundMoney,
} from '@/lib/invoice'
import { toNumber } from '@/lib/format'
import type {
  BusinessSnapshot,
  InvoiceDocumentData,
  InvoiceFormValues,
  InvoiceItem,
  InvoiceSummary,
  Settings,
} from '@/types/models'

export function buildDocumentFromInvoice(options: {
  invoice: InvoiceSummary
  items: InvoiceItem[]
  settings: Settings | undefined
  logoUrl: string | null
}): InvoiceDocumentData {
  const { invoice, items, settings, logoUrl } = options
  const business = normalizeSnapshot(invoice.business_snapshot)
  const showDiscount = toNumber(invoice.discount_amount) > 0
  const showTax = toNumber(invoice.tax_rate) > 0
  const total = toNumber(invoice.total)
  const subtotal = toNumber(invoice.subtotal)
  const discountAmount = toNumber(invoice.discount_amount)
  const taxRate = toNumber(invoice.tax_rate)
  const taxAmount = showTax ? roundMoney(((subtotal - discountAmount) * taxRate) / 100) : 0

  return {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    projectName: invoice.project_name ?? '',
    customerName: invoice.customer_name ?? '',
    notes: invoice.notes ?? '',
    paymentTerms: invoice.payment_terms ?? settings?.default_payment_terms ?? '',
    business,
    logoUrl,
    currency: settings?.currency ?? 'LKR',
    items: items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        unit: toNumber(item.unit),
        price: toNumber(item.price),
        lineTotal: toNumber(item.line_total),
      })),
    subtotal,
    discountAmount,
    taxRate,
    taxAmount,
    total,
    showDiscount,
    showTax,
  }
}

export function buildDocumentFromForm(options: {
  values: InvoiceFormValues
  settings: Settings
  logoUrl: string | null
}): InvoiceDocumentData {
  const { values, settings, logoUrl } = options
  const totals = calculateDisplayTotals(values.items, {
    discountAmount: values.discount_amount,
    taxRate: values.tax_rate,
    discountEnabled: settings.discount_enabled,
    taxEnabled: settings.tax_enabled,
  })

  const business: BusinessSnapshot = {
    business_name: values.business.business_name || 'EVOLAIRE',
    email: values.business.email,
    phone: values.business.phone,
    address: values.business.address,
    bank_account_name: values.business.bank_account_name,
    bank_account_number: values.business.bank_account_number,
    bank_name: values.business.bank_name,
    bank_branch: values.business.bank_branch,
    logo_path: values.business.logo_path ?? null,
  }

  const discountAmount = settings.discount_enabled ? totals.discount : 0
  const taxAmount = settings.tax_enabled ? totals.tax : 0

  return {
    invoiceNumber: values.invoice_number,
    invoiceDate: values.invoice_date,
    dueDate: values.due_date,
    projectName: values.project_name,
    customerName: values.customer_name,
    notes: values.notes,
    paymentTerms: values.payment_terms || settings.default_payment_terms,
    business,
    logoUrl,
    currency: settings.currency,
    items: values.items.map((item) => ({
      description: item.description,
      unit: toNumber(item.unit),
      price: toNumber(item.price),
      lineTotal: roundMoney(toNumber(item.unit) * toNumber(item.price)),
    })),
    subtotal: totals.subtotal,
    discountAmount,
    taxRate: values.tax_rate,
    taxAmount,
    total: totals.total,
    showDiscount: settings.discount_enabled && discountAmount > 0,
    showTax: settings.tax_enabled && taxAmount > 0,
  }
}

export const PRINT_PAGE_STYLE = `
  @page { size: A4; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .invoice-paper {
    box-shadow: none !important;
    margin: 0 !important;
  }
`
