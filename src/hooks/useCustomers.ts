import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { customerService } from '@/services/customerService'

export function useCustomers(search = '') {
  return useQuery({
    queryKey: queryKeys.customers(search),
    queryFn: () => customerService.list({ search }),
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customer(id ?? 'none'),
    queryFn: () => customerService.getById(id as string),
    enabled: Boolean(id),
  })
}

export function useCustomerStats(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerStats(id ?? 'none'),
    queryFn: () => customerService.stats(id as string),
    enabled: Boolean(id),
  })
}

export function useDeletedCustomers() {
  return useQuery({
    queryKey: queryKeys.deletedCustomers,
    queryFn: () => customerService.list({ includeDeleted: true }),
  })
}
