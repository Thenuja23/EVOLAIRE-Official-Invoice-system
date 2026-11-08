import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { customerSchema, type CustomerValues } from '@/lib/validation'
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useMutations'
import type { Customer } from '@/types/models'

interface CustomerDialogProps {
  open: boolean
  onClose: () => void
  customer?: Customer | null
  onSaved?: (customer: Customer) => void
}

const emptyValues: CustomerValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

export function CustomerDialog({ open, onClose, customer, onSaved }: CustomerDialogProps) {
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const isEditing = Boolean(customer)

  const form = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      customer
        ? {
            name: customer.name,
            phone: customer.phone ?? '',
            email: customer.email ?? '',
            address: customer.address ?? '',
            notes: customer.notes ?? '',
          }
        : emptyValues,
    )
  }, [open, customer, form])

  const submitting = createCustomer.isPending || updateCustomer.isPending

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = customer
        ? await updateCustomer.mutateAsync({ id: customer.id, input: values })
        : await createCustomer.mutateAsync(values)
      toast.success(isEditing ? 'Customer updated' : 'Customer added')
      onSaved?.(saved)
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit customer' : 'New customer'}
      description="These details are stored on the customer, not copied into old invoices."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={submitting}>
            {isEditing ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" htmlFor="customer-name" required error={form.formState.errors.name?.message}>
          <Input id="customer-name" placeholder="e.g. Maneesha Vithanage" {...form.register('name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="customer-phone" error={form.formState.errors.phone?.message}>
            <Input id="customer-phone" placeholder="07X XXX XXXX" {...form.register('phone')} />
          </Field>
          <Field label="Email" htmlFor="customer-email" error={form.formState.errors.email?.message}>
            <Input id="customer-email" type="email" placeholder="name@example.com" {...form.register('email')} />
          </Field>
        </div>
        <Field label="Address" htmlFor="customer-address" error={form.formState.errors.address?.message}>
          <Textarea id="customer-address" rows={2} placeholder="Street, city" {...form.register('address')} />
        </Field>
        <Field label="Notes" htmlFor="customer-notes" error={form.formState.errors.notes?.message}>
          <Textarea id="customer-notes" rows={2} placeholder="Anything worth remembering" {...form.register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
