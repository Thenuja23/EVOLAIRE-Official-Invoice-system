import { toNumber, todayISO } from '@/lib/format'
import { DEFAULT_PAYMENT_TERMS } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  fetchAllPages,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
} from '@/services/serviceUtils'
import { settingsService } from '@/services/settingsService'
import type { Json } from '@/types/database'
import type { BackupFile } from '@/types/models'

type RestoreCounts = {
  customers: number
  invoices: number
  invoice_items: number
  payments: number
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' || typeof value === 'string') return toNumber(value)
  return fallback
}

async function restoreBackupFallback(backup: BackupFile): Promise<RestoreCounts> {
  const client = getSupabase()
  const tables = backup?.tables
  if (!tables || typeof tables !== 'object') {
    throw new Error('This does not look like an EVOLAIRE backup file.')
  }

  if (
    !Array.isArray(tables.customers ?? []) ||
    !Array.isArray(tables.invoices ?? []) ||
    !Array.isArray(tables.invoice_items ?? []) ||
    !Array.isArray(tables.payments ?? [])
  ) {
    throw new Error('The backup file is malformed.')
  }

  const rawSettings = Array.isArray(tables.settings)
    ? (tables.settings[0] as Record<string, unknown> | undefined)
    : tables.settings && typeof tables.settings === 'object'
      ? (tables.settings as Record<string, unknown>)
      : undefined

  if (rawSettings) {
    await settingsService.update({
      business_name: String(rawSettings.business_name || 'EVOLAIRE'),
      logo_path: (rawSettings.logo_path as string | null) || null,
      email: (rawSettings.email as string | null) || null,
      phone: (rawSettings.phone as string | null) || null,
      address: (rawSettings.address as string | null) || null,
      bank_account_name: (rawSettings.bank_account_name as string | null) || null,
      bank_account_number: (rawSettings.bank_account_number as string | null) || null,
      bank_name: (rawSettings.bank_name as string | null) || null,
      bank_branch: (rawSettings.bank_branch as string | null) || null,
      default_payment_terms: String(rawSettings.default_payment_terms || DEFAULT_PAYMENT_TERMS),
      currency: String(rawSettings.currency || 'LKR'),
      invoice_prefix: String(rawSettings.invoice_prefix || 'EVO'),
      invoice_format: String(rawSettings.invoice_format || '{prefix}-{year}-{seq}'),
      next_invoice_seq: Math.max(Math.trunc(asNumber(rawSettings.next_invoice_seq, 1) || 1), 1),
      default_due_days: Math.max(Math.trunc(asNumber(rawSettings.default_due_days, 7)), 0),
      advance_percent: Math.min(Math.max(asNumber(rawSettings.advance_percent, 40), 0), 100),
      tax_enabled: Boolean(rawSettings.tax_enabled),
      discount_enabled: Boolean(rawSettings.discount_enabled),
    })
  }

  for (const raw of (tables.customers ?? []) as Array<Record<string, unknown>>) {
    await client
      .from('customers')
      .upsert(
        {
          ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
          name: String(raw.name || 'Unnamed customer').trim() || 'Unnamed customer',
          phone: (raw.phone as string | null) || null,
          email: (raw.email as string | null) || null,
          address: (raw.address as string | null) || null,
          notes: (raw.notes as string | null) || null,
          deleted_at: (raw.deleted_at as string | null) || null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  }

  const today = todayISO()
  for (const raw of (tables.invoices ?? []) as Array<Record<string, unknown>>) {
    const invDate = typeof raw.invoice_date === 'string' && raw.invoice_date ? raw.invoice_date : today
    const dueDate = typeof raw.due_date === 'string' && raw.due_date ? raw.due_date : invDate
    await client
      .from('invoices')
      .upsert(
        {
          ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
          invoice_number: String(raw.invoice_number || '').trim() || `RESTORED-${Date.now()}`,
          customer_id: (raw.customer_id as string | null) || null,
          customer_name: String(raw.customer_name ?? ''),
          project_name: (raw.project_name as string | null) || null,
          invoice_date: invDate,
          due_date: dueDate >= invDate ? dueDate : invDate,
          status: raw.status === 'final' ? 'final' : 'draft',
          notes: (raw.notes as string | null) || null,
          payment_terms: (raw.payment_terms as string | null) || null,
          business_snapshot: ((raw.business_snapshot as Json) ?? {}) as Json,
          discount_amount: Math.max(asNumber(raw.discount_amount), 0),
          tax_rate: Math.min(Math.max(asNumber(raw.tax_rate), 0), 100),
          subtotal: Math.max(asNumber(raw.subtotal), 0),
          total: Math.max(asNumber(raw.total), 0),
          deleted_at: (raw.deleted_at as string | null) || null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  }

  for (const raw of (tables.invoice_items ?? []) as Array<Record<string, unknown>>) {
    const position = Math.trunc(asNumber(raw.position))
    const unit = asNumber(raw.unit, 1) || 1
    const price = asNumber(raw.price)
    if (!raw.invoice_id || position < 1 || position > 14 || unit <= 0 || price < 0) continue
    await client
      .from('invoice_items')
      .upsert(
        {
          ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
          invoice_id: String(raw.invoice_id),
          position,
          description: String(raw.description ?? ''),
          unit,
          price,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  }

  for (const raw of (tables.payments ?? []) as Array<Record<string, unknown>>) {
    const amount = asNumber(raw.amount)
    if (!raw.invoice_id || amount <= 0) continue
    const method =
      raw.method === 'cash' ||
      raw.method === 'bank transfer' ||
      raw.method === 'card' ||
      raw.method === 'other'
        ? raw.method
        : 'other'
    await client
      .from('payments')
      .upsert(
        {
          ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
          invoice_id: String(raw.invoice_id),
          amount,
          paid_on: typeof raw.paid_on === 'string' && raw.paid_on ? raw.paid_on : today,
          method,
          note: (raw.note as string | null) || null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  }

  const [customersCount, invoicesCount, itemsCount, paymentsCount] = await Promise.all([
    client.from('customers').select('id', { count: 'exact', head: true }),
    client.from('invoices').select('id', { count: 'exact', head: true }),
    client.from('invoice_items').select('id', { count: 'exact', head: true }),
    client.from('payments').select('id', { count: 'exact', head: true }),
  ])

  return {
    customers: customersCount.count ?? 0,
    invoices: invoicesCount.count ?? 0,
    invoice_items: itemsCount.count ?? 0,
    payments: paymentsCount.count ?? 0,
  }
}

export const backupService = {
  async exportAll(): Promise<BackupFile> {
    const client = getSupabase()
    const [settings, customers, invoices, items, payments] = await Promise.all([
      fetchAllPages((from, to) =>
        client.from('settings').select('*').order('id').range(from, to),
      ),
      fetchAllPages((from, to) =>
        client.from('customers').select('*').order('id').range(from, to),
      ),
      fetchAllPages((from, to) =>
        client.from('invoices').select('*').order('id').range(from, to),
      ),
      fetchAllPages((from, to) =>
        client.from('invoice_items').select('*').order('id').range(from, to),
      ),
      fetchAllPages((from, to) =>
        client.from('payments').select('*').order('id').range(from, to),
      ),
    ])

    return {
      format: 'evolaire-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      tables: {
        settings,
        customers,
        invoices,
        invoice_items: items,
        payments,
      },
    }
  },

  async restore(backup: BackupFile): Promise<RestoreCounts> {
    if (isSchemaFeatureAvailable('restore_backup')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('restore_backup', {
        payload: backup as unknown as Json,
      })
      if (!error) {
        const result = (data ?? {}) as Record<string, unknown>
        return {
          customers: Number(result.customers ?? 0),
          invoices: Number(result.invoices ?? 0),
          invoice_items: Number(result.invoice_items ?? 0),
          payments: Number(result.payments ?? 0),
        }
      }
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('restore_backup')
    }

    return restoreBackupFallback(backup)
  },
}
