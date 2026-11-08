import type { Json } from './database'

export type InvoiceStatus = 'draft' | 'final'

export type PaymentStatus = 'Draft' | 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue'

export type PaymentMethod = 'cash' | 'bank transfer' | 'card' | 'other'

export interface Settings {
  id: string
  user_id: string
  business_name: string
  logo_path: string | null
  email: string | null
  phone: string | null
  address: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_name: string | null
  bank_branch: string | null
  default_payment_terms: string
  currency: string
  invoice_prefix: string
  invoice_format: string
  next_invoice_seq: number
  default_due_days: number
  advance_percent: number
  tax_enabled: boolean
  discount_enabled: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  user_id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string
  project_name: string | null
  invoice_date: string
  due_date: string
  status: string
  notes: string | null
  payment_terms: string | null
  business_snapshot: Json
  discount_amount: number
  tax_rate: number
  subtotal: number
  total: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  id: string
  user_id: string
  invoice_id: string
  position: number
  description: string
  unit: number
  price: number
  line_total: number
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  user_id: string
  invoice_id: string
  amount: number
  paid_on: string
  method: PaymentMethod | string
  note: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceSummary extends Invoice {
  paid: number
  balance: number
  payment_status: PaymentStatus
}

export interface InvoiceFull extends InvoiceSummary {
  items: InvoiceItem[]
  payments: Payment[]
  customer?: Customer | null
}

export interface BusinessSnapshot {
  business_name: string
  email: string
  phone: string
  address: string
  bank_account_name: string
  bank_account_number: string
  bank_name: string
  bank_branch: string
  logo_path: string | null
}

/** Payload sent to the save_invoice RPC. Totals are deliberately absent. */
export interface InvoiceItemPayload {
  description: string
  unit: number
  price: number
}

export interface InvoicePayload {
  id?: string
  invoice_number?: string
  customer_id?: string | null
  customer_name?: string
  project_name?: string
  invoice_date?: string
  due_date?: string
  status?: InvoiceStatus
  notes?: string
  payment_terms?: string
  business_snapshot?: BusinessSnapshot | Json
  discount_amount?: number
  tax_rate?: number
  items?: InvoiceItemPayload[]
}

/** Everything the A4 invoice document needs to render. */
export interface InvoiceDocumentData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  projectName: string
  customerName: string
  notes: string
  paymentTerms: string
  business: BusinessSnapshot
  logoUrl: string | null
  currency: string
  items: Array<{ description: string; unit: number; price: number; lineTotal: number }>
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  showDiscount: boolean
  showTax: boolean
}

export interface InvoiceListFilters {
  search?: string
  status?: PaymentStatus | 'all'
  customerId?: string
  from?: string
  to?: string
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  page?: number
  pageSize?: number
}

export interface InvoiceListResult {
  rows: InvoiceSummary[]
  total: number
}

export interface DashboardMetrics {
  billed_this_month: number
  received_this_month: number
  total_outstanding: number
  overdue_count: number
}

export interface MonthlyRevenuePoint {
  month: string
  billed: number
  received: number
}

export interface CustomerStats {
  invoice_count: number
  billed: number
  paid: number
  outstanding: number
}

export interface PaymentInput {
  invoice_id: string
  amount: number
  paid_on: string
  method: PaymentMethod
  note?: string | null
}

export interface SettingsInput {
  business_name: string
  logo_path?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  bank_account_name?: string | null
  bank_account_number?: string | null
  bank_name?: string | null
  bank_branch?: string | null
  default_payment_terms: string
  currency: string
  invoice_prefix: string
  invoice_format: string
  next_invoice_seq: number
  default_due_days: number
  advance_percent: number
  tax_enabled: boolean
  discount_enabled: boolean
}

export interface CustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

export interface BackupTablePayload {
  settings: unknown[]
  customers: unknown[]
  invoices: unknown[]
  invoice_items: unknown[]
  payments: unknown[]
}

export interface BackupFile {
  format: 'evolaire-backup'
  version: number
  exported_at: string
  tables: BackupTablePayload
}
