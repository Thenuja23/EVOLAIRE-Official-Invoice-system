import { businessSnapshotFromSettings } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
} from '@/services/serviceUtils'
import type { Json } from '@/types/database'
import type { Settings, SettingsInput } from '@/types/models'

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 2 * 1024 * 1024

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

async function loadSampleDataFallback(): Promise<string> {
  const client = getSupabase()
  const { count, error: countError } = await client
    .from('invoices')
    .select('id', { count: 'exact', head: true })
  if (countError) throw countError
  if ((count ?? 0) > 0) {
    throw new Error('Sample data can only be loaded when there are no invoices.')
  }

  const current = await settingsService.getOrCreate()
  const nextSeq = Math.max(current.next_invoice_seq || 1, 114)
  if (nextSeq !== current.next_invoice_seq) {
    const { error: seqError } = await client
      .from('settings')
      .update({ next_invoice_seq: nextSeq })
      .eq('id', current.id)
    if (seqError) throw seqError
  }

  const snapshot = businessSnapshotFromSettings(current) as unknown as Json

  const { data: customer, error: customerError } = await client
    .from('customers')
    .insert({ name: 'Maneesha Vithanage' })
    .select('id')
    .single()
  if (customerError) throw customerError

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .insert({
      invoice_number: 'EVO-2026-113',
      customer_id: customer.id,
      customer_name: 'Maneesha Vithanage',
      project_name: 'Soul of seafood',
      invoice_date: '2026-10-31',
      due_date: '2026-11-07',
      status: 'final',
      payment_terms: current.default_payment_terms,
      business_snapshot: snapshot,
      subtotal: 35000,
      total: 35000,
    })
    .select('id')
    .single()
  if (invoiceError) throw invoiceError

  const { error: itemError } = await client.from('invoice_items').insert({
    invoice_id: invoice.id,
    position: 1,
    description: 'Social Media Handling - Monthly',
    unit: 1,
    price: 35000,
  })
  if (itemError) throw itemError

  const { error: paymentError } = await client.from('payments').insert({
    invoice_id: invoice.id,
    amount: 10000,
    paid_on: '2026-10-31',
    method: 'bank transfer',
    note: 'Initial payment',
  })
  if (paymentError) throw paymentError

  return invoice.id
}

export const settingsService = {
  async getOrCreate(): Promise<Settings> {
    const client = getSupabase()
    const { data, error } = await client.from('settings').select('*').limit(1).maybeSingle()
    if (error) throw error
    if (data) return data as Settings

    const created = await client.from('settings').insert({}).select('*').single()
    if (created.error) {
      // Another tab may have created the row between the select and insert.
      if (created.error.code === '23505') {
        const retry = await client.from('settings').select('*').limit(1).single()
        if (retry.error) throw retry.error
        return retry.data as Settings
      }
      throw created.error
    }
    return created.data as Settings
  },

  async update(input: Partial<SettingsInput>): Promise<Settings> {
    const client = getSupabase()
    const current = await settingsService.getOrCreate()
    const { data, error } = await client
      .from('settings')
      .update(input)
      .eq('id', current.id)
      .select('*')
      .single()
    if (error) throw error
    return data as Settings
  },

  async getLogoUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null
    const client = getSupabase()
    const { data, error } = await client.storage.from('logos').createSignedUrl(path, 60 * 60)
    if (error) throw error
    return data?.signedUrl ?? null
  },

  async uploadLogo(file: File): Promise<{ path: string; logoUrl: string | null }> {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      throw new Error('Choose a PNG, JPG or WebP image.')
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new Error('The logo must be smaller than 2 MB.')
    }

    const client = getSupabase()
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Your session has expired. Please sign in again.')

    const current = await settingsService.getOrCreate()
    const path = `${user.id}/logo-${Date.now()}.${extensionFor(file.type)}`

    const { error: uploadError } = await client.storage.from('logos').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw uploadError

    const updated = await client
      .from('settings')
      .update({ logo_path: path })
      .eq('id', current.id)
      .select('*')
      .single()
    if (updated.error) {
      await client.storage.from('logos').remove([path])
      throw updated.error
    }

    if (current.logo_path && current.logo_path !== path) {
      await client.storage.from('logos').remove([current.logo_path])
    }

    return { path, logoUrl: await settingsService.getLogoUrl(path) }
  },

  async removeLogo(): Promise<void> {
    const client = getSupabase()
    const current = await settingsService.getOrCreate()
    const { error } = await client
      .from('settings')
      .update({ logo_path: null })
      .eq('id', current.id)
    if (error) throw error
    if (current.logo_path) {
      await client.storage.from('logos').remove([current.logo_path])
    }
  },

  async loadSampleData(): Promise<string> {
    if (isSchemaFeatureAvailable('load_sample_data')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('load_sample_data')
      if (!error) return data as string
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('load_sample_data')
    }

    return loadSampleDataFallback()
  },
}
