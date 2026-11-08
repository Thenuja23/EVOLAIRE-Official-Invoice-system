import { getSupabase } from '@/lib/supabase'
import { fetchAllPages } from '@/services/serviceUtils'
import type { Json } from '@/types/database'
import type { BackupFile } from '@/types/models'

type RestoreCounts = {
  customers: number
  invoices: number
  invoice_items: number
  payments: number
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
    const client = getSupabase()
    const { data, error } = await client.rpc('restore_backup', {
      payload: backup as unknown as Json,
    })
    if (error) throw error
    const result = (data ?? {}) as Record<string, unknown>
    return {
      customers: Number(result.customers ?? 0),
      invoices: Number(result.invoices ?? 0),
      invoice_items: Number(result.invoice_items ?? 0),
      payments: Number(result.payments ?? 0),
    }
  },
}
