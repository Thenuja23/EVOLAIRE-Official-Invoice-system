import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { settingsService } from '@/services/settingsService'
import type { Settings, SettingsInput } from '@/types/models'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => settingsService.getOrCreate(),
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<SettingsInput>) => settingsService.update(input),
    onSuccess: (settings: Settings) => {
      queryClient.setQueryData(queryKeys.settings, settings)
      void queryClient.invalidateQueries({ queryKey: queryKeys.logo(settings.logo_path) })
    },
  })
}

export function useUploadLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

export function useRemoveLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsService.removeLogo(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

export function useLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.logo(path),
    queryFn: () => settingsService.getLogoUrl(path),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}
