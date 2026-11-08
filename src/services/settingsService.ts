import { businessSnapshotFromSettings } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  activateLocalWorkspace,
  createUuid,
  getCurrentUserId,
  isLocalWorkspaceActive,
  isRlsOrPermissionError,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
  readLocalWorkspace,
  writeLocalWorkspace,
} from '@/services/serviceUtils'
import type { Json } from '@/types/database'
import type { Settings, SettingsInput } from '@/types/models'

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOCAL_LOGO_PATH = 'local:logo'

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the selected image file.'))
    reader.readAsDataURL(file)
  })
}

function isStorageFallbackError(error: unknown): boolean {
  if (isRlsOrPermissionError(error)) return true
  if (!error || typeof error !== 'object') return false
  const text = `${(error as { message?: string }).message ?? ''}`.toLowerCase()
  return (
    text.includes('bucket not found') ||
    text.includes('not found') ||
    text.includes('unauthorized') ||
    text.includes('security policy')
  )
}

function loadSampleDataIntoLocalWorkspace(userId: string): string {
  const ws = activateLocalWorkspace(userId)
  if (ws.invoices.length > 0) {
    throw new Error('Sample data can only be loaded when there are no invoices.')
  }

  const now = new Date().toISOString()
  ws.settings.next_invoice_seq = Math.max(ws.settings.next_invoice_seq || 1, 114)
  ws.settings.updated_at = now

  const customerId = createUuid()
  ws.customers.push({
    id: customerId,
    user_id: userId,
    name: 'Maneesha Vithanage',
    phone: null,
    email: null,
    address: null,
    notes: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  })

  const invoiceId = createUuid()
  const snapshot = businessSnapshotFromSettings(ws.settings) as unknown as Json

  ws.invoices.push({
    id: invoiceId,
    user_id: userId,
    invoice_number: 'EVO-2026-113',
    customer_id: customerId,
    customer_name: 'Maneesha Vithanage',
    project_name: 'Soul of seafood',
    invoice_date: '2026-10-31',
    due_date: '2026-11-07',
    status: 'final',
    notes: null,
    payment_terms: ws.settings.default_payment_terms,
    business_snapshot: snapshot,
    discount_amount: 0,
    tax_rate: 0,
    subtotal: 35000,
    total: 35000,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  })

  ws.invoice_items.push({
    id: createUuid(),
    user_id: userId,
    invoice_id: invoiceId,
    position: 1,
    description: 'Social Media Handling - Monthly',
    unit: 1,
    price: 35000,
    line_total: 35000,
    created_at: now,
    updated_at: now,
  })

  ws.payments.push({
    id: createUuid(),
    user_id: userId,
    invoice_id: invoiceId,
    amount: 10000,
    paid_on: '2026-10-31',
    method: 'bank transfer',
    note: 'Initial payment',
    created_at: now,
    updated_at: now,
  })

  writeLocalWorkspace(userId, ws)
  return invoiceId
}

async function loadSampleDataFallback(): Promise<string> {
  const userId = await getCurrentUserId()
  if (isLocalWorkspaceActive(userId)) {
    return loadSampleDataIntoLocalWorkspace(userId)
  }

  const client = getSupabase()
  try {
    const { count, error: countError } = await client
      .from('invoices')
      .select('id', { count: 'exact', head: true })
    if (countError) throw countError
    if ((count ?? 0) > 0) {
      throw new Error('Sample data can only be loaded when there are no invoices.')
    }

    const current = await settingsService.getOrCreate()
    if (isLocalWorkspaceActive(userId)) {
      return loadSampleDataIntoLocalWorkspace(userId)
    }

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
      .insert({ user_id: userId, name: 'Maneesha Vithanage' })
      .select('id')
      .single()
    if (customerError) throw customerError

    const { data: invoice, error: invoiceError } = await client
      .from('invoices')
      .insert({
        user_id: userId,
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
      user_id: userId,
      invoice_id: invoice.id,
      position: 1,
      description: 'Social Media Handling - Monthly',
      unit: 1,
      price: 35000,
    })
    if (itemError) throw itemError

    const { error: paymentError } = await client.from('payments').insert({
      user_id: userId,
      invoice_id: invoice.id,
      amount: 10000,
      paid_on: '2026-10-31',
      method: 'bank transfer',
      note: 'Initial payment',
    })
    if (paymentError) throw paymentError

    return invoice.id
  } catch (error) {
    if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
      return loadSampleDataIntoLocalWorkspace(userId)
    }
    throw error
  }
}

export const settingsService = {
  async getOrCreate(): Promise<Settings> {
    const userId = await getCurrentUserId()
    const client = getSupabase()
    const { data, error } = await client.from('settings').select('*').limit(1).maybeSingle()
    if (error) {
      if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
        return activateLocalWorkspace(userId).settings
      }
      throw error
    }
    if (data) {
      const ws = readLocalWorkspace(userId)
      ws.settings = data as Settings
      writeLocalWorkspace(userId, ws)
      return data as Settings
    }

    if (isLocalWorkspaceActive(userId)) {
      return readLocalWorkspace(userId).settings
    }

    const created = await client
      .from('settings')
      .insert({ user_id: userId })
      .select('*')
      .single()

    if (created.error) {
      if (created.error.code === '23505') {
        const retry = await client.from('settings').select('*').limit(1).maybeSingle()
        if (!retry.error && retry.data) return retry.data as Settings
      }
      if (isRlsOrPermissionError(created.error) || isSchemaCacheMissingError(created.error)) {
        return activateLocalWorkspace(userId).settings
      }
      throw created.error
    }

    const ws = readLocalWorkspace(userId)
    ws.settings = created.data as Settings
    writeLocalWorkspace(userId, ws)
    return created.data as Settings
  },

  async update(input: Partial<SettingsInput>): Promise<Settings> {
    const userId = await getCurrentUserId()
    const current = await settingsService.getOrCreate()
    const ws = readLocalWorkspace(userId)

    ws.settings = {
      ...current,
      ...input,
      user_id: userId,
      updated_at: new Date().toISOString(),
    }
    writeLocalWorkspace(userId, ws)

    if (isLocalWorkspaceActive(userId)) {
      return ws.settings
    }

    const client = getSupabase()
    const { data, error } = await client
      .from('settings')
      .update(input)
      .eq('id', current.id)
      .select('*')
      .single()

    if (error) {
      if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
        activateLocalWorkspace(userId)
        return ws.settings
      }
      throw error
    }

    ws.settings = data as Settings
    writeLocalWorkspace(userId, ws)
    return data as Settings
  },

  async getLogoUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null
    if (path.startsWith('data:')) return path
    if (path === LOCAL_LOGO_PATH) {
      const userId = await getCurrentUserId()
      return readLocalWorkspace(userId).logo_data_url
    }

    const client = getSupabase()
    const { data, error } = await client.storage.from('logos').createSignedUrl(path, 60 * 60)
    if (error) {
      if (isStorageFallbackError(error)) {
        const userId = await getCurrentUserId()
        return readLocalWorkspace(userId).logo_data_url
      }
      throw error
    }
    return data?.signedUrl ?? null
  },

  async uploadLogo(file: File): Promise<{ path: string; logoUrl: string | null }> {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      throw new Error('Choose a PNG, JPG or WebP image.')
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new Error('The logo must be smaller than 2 MB.')
    }

    const userId = await getCurrentUserId()
    const current = await settingsService.getOrCreate()

    if (isLocalWorkspaceActive(userId)) {
      const dataUrl = await readFileAsDataUrl(file)
      const ws = readLocalWorkspace(userId)
      ws.logo_data_url = dataUrl
      ws.settings = {
        ...current,
        logo_path: LOCAL_LOGO_PATH,
        updated_at: new Date().toISOString(),
      }
      writeLocalWorkspace(userId, ws)
      return { path: LOCAL_LOGO_PATH, logoUrl: dataUrl }
    }

    const client = getSupabase()
    const path = `${userId}/logo-${Date.now()}.${extensionFor(file.type)}`

    const { error: uploadError } = await client.storage.from('logos').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

    if (uploadError) {
      if (isStorageFallbackError(uploadError)) {
        const dataUrl = await readFileAsDataUrl(file)
        const ws = activateLocalWorkspace(userId)
        ws.logo_data_url = dataUrl
        ws.settings = {
          ...current,
          logo_path: LOCAL_LOGO_PATH,
          updated_at: new Date().toISOString(),
        }
        writeLocalWorkspace(userId, ws)
        return { path: LOCAL_LOGO_PATH, logoUrl: dataUrl }
      }
      throw uploadError
    }

    const updated = await client
      .from('settings')
      .update({ logo_path: path })
      .eq('id', current.id)
      .select('*')
      .single()

    if (updated.error) {
      await client.storage.from('logos').remove([path])
      if (isRlsOrPermissionError(updated.error)) {
        const dataUrl = await readFileAsDataUrl(file)
        const ws = activateLocalWorkspace(userId)
        ws.logo_data_url = dataUrl
        ws.settings = {
          ...current,
          logo_path: LOCAL_LOGO_PATH,
          updated_at: new Date().toISOString(),
        }
        writeLocalWorkspace(userId, ws)
        return { path: LOCAL_LOGO_PATH, logoUrl: dataUrl }
      }
      throw updated.error
    }

    if (current.logo_path && current.logo_path !== path && current.logo_path !== LOCAL_LOGO_PATH) {
      await client.storage.from('logos').remove([current.logo_path])
    }

    const ws = readLocalWorkspace(userId)
    ws.settings = updated.data as Settings
    writeLocalWorkspace(userId, ws)

    return { path, logoUrl: await settingsService.getLogoUrl(path) }
  },

  async removeLogo(): Promise<void> {
    const userId = await getCurrentUserId()
    const current = await settingsService.getOrCreate()
    const ws = readLocalWorkspace(userId)
    ws.logo_data_url = null
    ws.settings = {
      ...current,
      logo_path: null,
      updated_at: new Date().toISOString(),
    }
    writeLocalWorkspace(userId, ws)

    if (isLocalWorkspaceActive(userId)) {
      return
    }

    const client = getSupabase()
    const { error } = await client
      .from('settings')
      .update({ logo_path: null })
      .eq('id', current.id)
    if (error && !isRlsOrPermissionError(error)) throw error
    if (current.logo_path && current.logo_path !== LOCAL_LOGO_PATH) {
      await client.storage.from('logos').remove([current.logo_path])
    }
  },

  async loadSampleData(): Promise<string> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('load_sample_data')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('load_sample_data')
      if (!error) return data as string
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('load_sample_data')
    }

    return loadSampleDataFallback()
  },
}
