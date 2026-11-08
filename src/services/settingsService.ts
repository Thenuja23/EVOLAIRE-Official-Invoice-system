import { getSupabase } from '@/lib/supabase'
import type { Settings, SettingsInput } from '@/types/models'

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 2 * 1024 * 1024

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
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
    if (error) return null
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
    const client = getSupabase()
    const { data, error } = await client.rpc('load_sample_data')
    if (error) throw error
    return data as string
  },
}
