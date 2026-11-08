import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { invoiceService } from '@/services/invoiceService'
import type { InvoiceListFilters } from '@/types/models'

export function useInvoices(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: queryKeys.invoices(filters),
    queryFn: () => invoiceService.list(filters),
    placeholderData: keepPreviousData,
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoice(id ?? 'none'),
    queryFn: () => invoiceService.getFull(id as string),
    enabled: Boolean(id),
  })
}

export function useInvoiceCount() {
  return useQuery({
    queryKey: queryKeys.invoiceCount,
    queryFn: () => invoiceService.count(),
  })
}

export function useDeletedInvoices() {
  return useQuery({
    queryKey: queryKeys.trash,
    queryFn: () => invoiceService.listDeleted(),
  })
}
