import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { customerService } from '@/services/customerService'
import { invoiceService } from '@/services/invoiceService'
import { paymentService } from '@/services/paymentService'
import { settingsService } from '@/services/settingsService'
import type { CustomerInput, InvoicePayload, PaymentInput, Settings } from '@/types/models'

function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    void queryClient.invalidateQueries({ queryKey: ['invoice'] })
    void queryClient.invalidateQueries({ queryKey: ['invoice-count'] })
    void queryClient.invalidateQueries({ queryKey: ['trash'] })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
    void queryClient.invalidateQueries({ queryKey: ['customer'] })
    void queryClient.invalidateQueries({ queryKey: ['customer-stats'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    void queryClient.invalidateQueries({ queryKey: ['monthly-revenue'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard-recent'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard-overdue'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard-upcoming'] })
    void queryClient.invalidateQueries({ queryKey: ['payments'] })
  }
}

export function useSaveInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (payload: InvoicePayload) => invoiceService.save(payload),
    onSuccess: invalidate,
  })
}

export function useDuplicateInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Settings }) =>
      invoiceService.duplicate(id, settings),
    onSuccess: invalidate,
  })
}

export function useNextMonthInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Settings }) =>
      invoiceService.createNextMonth(id, settings),
    onSuccess: invalidate,
  })
}

export function useDeleteInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => invoiceService.softDelete(id),
    onSuccess: invalidate,
  })
}

export function useRestoreInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => invoiceService.restore(id),
    onSuccess: invalidate,
  })
}

export function usePermanentlyDeleteInvoice() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => invoiceService.permanentlyDelete(id),
    onSuccess: invalidate,
  })
}

export function useCreateCustomer() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (input: CustomerInput) => customerService.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerInput }) =>
      customerService.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteCustomer() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => customerService.softDelete(id),
    onSuccess: invalidate,
  })
}

export function useCreatePayment(invoiceId: string) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (input: PaymentInput) => paymentService.create(input),
    onSuccess: () => {
      invalidate()
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments(invoiceId) })
    },
  })
}

export function useUpdatePayment(invoiceId: string) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PaymentInput }) =>
      paymentService.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeletePayment(invoiceId: string) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => paymentService.remove(id),
    onSuccess: invalidate,
  })
}

export function useLoadSampleData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsService.loadSampleData(),
    onSuccess: () => {
      queryClient.clear()
    },
  })
}
