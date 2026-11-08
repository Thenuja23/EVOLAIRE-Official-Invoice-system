import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { PAYMENT_METHODS } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney, todayISO } from '@/lib/format'
import { paymentSchema, type PaymentValues } from '@/lib/validation'
import { useCreatePayment, useUpdatePayment } from '@/hooks/useMutations'
import type { Payment } from '@/types/models'

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  invoiceId: string
  currency: string
  remaining: number
  defaultAmount?: number
  payment?: Payment | null
}

export function PaymentDialog({
  open,
  onClose,
  invoiceId,
  currency,
  remaining,
  defaultAmount,
  payment,
}: PaymentDialogProps) {
  const createPayment = useCreatePayment(invoiceId)
  const updatePayment = useUpdatePayment(invoiceId)
  const isEditing = Boolean(payment)

  const maxAmount = Math.max(0, remaining + (payment ? payment.amount : 0))

  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: defaultAmount && defaultAmount > 0 ? defaultAmount : remaining,
      paid_on: todayISO(),
      method: 'bank transfer',
      note: '',
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      amount: payment
        ? payment.amount
        : defaultAmount && defaultAmount > 0
          ? Math.min(defaultAmount, remaining)
          : remaining,
      paid_on: payment?.paid_on ?? todayISO(),
      method: (payment?.method as PaymentValues['method']) ?? 'bank transfer',
      note: payment?.note ?? '',
    })
  }, [open, payment, defaultAmount, remaining, form])

  const submitting = createPayment.isPending || updatePayment.isPending

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.amount > maxAmount + 0.005) {
      form.setError('amount', {
        message: `The most you can record is ${formatMoney(maxAmount, currency)}.`,
      })
      return
    }

    try {
      if (payment) {
        await updatePayment.mutateAsync({ id: payment.id, input: { invoice_id: invoiceId, ...values } })
        toast.success('Payment updated')
      } else {
        await createPayment.mutateAsync({ invoice_id: invoiceId, ...values })
        toast.success('Payment recorded')
      }
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit payment' : 'Record a payment'}
      description={
        maxAmount > 0
          ? `Outstanding balance: ${formatMoney(maxAmount, currency)}`
          : 'This invoice is fully paid.'
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={submitting} disabled={maxAmount <= 0}>
            {isEditing ? 'Save payment' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} className="space-y-4">
        {maxAmount <= 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            The full invoice amount has already been paid. Delete or edit an existing payment instead.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="payment-amount" required error={form.formState.errors.amount?.message}>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              {...form.register('amount', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Date" htmlFor="payment-date" required error={form.formState.errors.paid_on?.message}>
            <Input id="payment-date" type="date" {...form.register('paid_on')} />
          </Field>
        </div>
        <Field label="Method" htmlFor="payment-method" error={form.formState.errors.method?.message}>
          <Select id="payment-method" {...form.register('method')}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="payment-note" error={form.formState.errors.note?.message}>
          <Textarea id="payment-note" rows={2} placeholder="Optional note, e.g. bank slip number" {...form.register('note')} />
        </Field>
      </form>
    </Modal>
  )
}
