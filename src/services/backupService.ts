import { getSupabase } from '@/lib/supabase'
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
      client.from('settings').select('*'),
      client.from('customers').select('*'),
      client.from('invoices').select('*'),
      client.from('invoice_items').select('*'),
      client.from('payments').select('*'),
    ])

    for (const result of [settings, customers, invoices, items, payments]) {
      if (result.error) throw result.error
    }

    return {
      format: 'evolaire-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      tables: {
        settings: settings.data ?? [],
        customers: customers.data ?? [],
        invoices: invoices.data ?? [],
        invoice_items: items.data ?? [],
        payments: payments.data ?? [],
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
