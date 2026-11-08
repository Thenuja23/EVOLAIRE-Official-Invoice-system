import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, RotateCcw, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useDeletedInvoices } from '@/hooks/useInvoices'
import { useDeletedCustomers } from '@/hooks/useCustomers'
import { useSettings } from '@/hooks/useSettings'
import {
  usePermanentlyDeleteCustomer,
  usePermanentlyDeleteInvoice,
  useRestoreCustomer,
  useRestoreInvoice,
} from '@/hooks/useMutations'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatMoney } from '@/lib/format'

type PendingDelete =
  | { kind: 'invoice'; id: string; label: string; detail: string }
  | { kind: 'customer'; id: string; label: string; detail: string }

export function TrashPage() {
  const invoices = useDeletedInvoices()
  const customers = useDeletedCustomers()
  const settings = useSettings()

  const restoreInvoice = useRestoreInvoice()
  const permanentlyDeleteInvoice = usePermanentlyDeleteInvoice()
  const restoreCustomer = useRestoreCustomer()
  const permanentlyDeleteCustomer = usePermanentlyDeleteCustomer()

  const [pending, setPending] = useState<PendingDelete | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const currency = settings.data?.currency ?? 'LKR'
  const invoiceRows = invoices.data ?? []
  const customerRows = customers.data ?? []
  const loading = invoices.isLoading || customers.isLoading
  const anyError = invoices.isError || customers.isError
  const isEmpty = !loading && invoiceRows.length === 0 && customerRows.length === 0

  const handleRestoreInvoice = async (id: string, label: string) => {
    setBusyId(id)
    try {
      await restoreInvoice.mutateAsync(id)
      toast.success(`${label} restored`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const handleRestoreCustomer = async (id: string, label: string) => {
    setBusyId(id)
    try {
      await restoreCustomer.mutateAsync(id)
      toast.success(`${label} restored`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!pending) return
    try {
      if (pending.kind === 'invoice') {
        await permanentlyDeleteInvoice.mutateAsync(pending.id)
      } else {
        await permanentlyDeleteCustomer.mutateAsync(pending.id)
      }
      toast.success(`${pending.label} permanently deleted`)
      setPending(null)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trash"
        description="Deleted invoices and customers stay here until you restore them or remove them for good."
      />

      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
        <p>
          Invoice numbers are never reused, even after permanent deletion. Permanently deleting a customer does not
          change invoices that were already created for them.
        </p>
      </div>

      {anyError ? (
        <ErrorState
          title="The trash could not load"
          description={getErrorMessage(invoices.error ?? customers.error)}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void invoices.refetch()
                void customers.refetch()
              }}
            >
              Try again
            </Button>
          }
        />
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : isEmpty ? (
        <EmptyState
          title="The trash is empty"
          description="Invoices or customers you move to the trash will wait here until you decide what to do with them."
          icon={<Trash2 className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Invoices"
              description={`${invoiceRows.length} in the trash`}
              action={<FileText className="h-4 w-4 text-ink-400" />}
            />
            <div className="px-3 pb-4 pt-2">
              {invoiceRows.length === 0 ? (
                <EmptyState compact title="No deleted invoices" description="Deleted invoices will appear here." />
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
                  {invoiceRows.map((invoice) => (
                    <div key={invoice.id} className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/invoices/${invoice.id}`}
                          className="text-sm font-semibold text-ink-900 hover:underline dark:text-white"
                        >
                          {invoice.invoice_number}
                        </Link>
                        <StatusBadge status={invoice.payment_status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                        {invoice.customer_name || 'No customer'} · {formatMoney(invoice.total, currency)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">
                        Deleted {formatDateTime(invoice.deleted_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                          loading={busyId === invoice.id && restoreInvoice.isPending}
                          disabled={busyId !== null && busyId !== invoice.id}
                          onClick={() => void handleRestoreInvoice(invoice.id, invoice.invoice_number)}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          disabled={busyId !== null && busyId !== invoice.id}
                          onClick={() =>
                            setPending({
                              kind: 'invoice',
                              id: invoice.id,
                              label: invoice.invoice_number,
                              detail: `${invoice.invoice_number} and all of its payments will be gone for good.`,
                            })
                          }
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Customers"
              description={`${customerRows.length} in the trash`}
              action={<Users className="h-4 w-4 text-ink-400" />}
            />
            <div className="px-3 pb-4 pt-2">
              {customerRows.length === 0 ? (
                <EmptyState compact title="No deleted customers" description="Deleted customers will appear here." />
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
                  {customerRows.map((customer) => (
                    <div key={customer.id} className="px-2 py-3">
                      <p className="text-sm font-semibold text-ink-900 dark:text-white">{customer.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                        {customer.email || customer.phone || 'No contact details'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">
                        Deleted {formatDateTime(customer.deleted_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                          loading={busyId === customer.id && restoreCustomer.isPending}
                          disabled={busyId !== null && busyId !== customer.id}
                          onClick={() => void handleRestoreCustomer(customer.id, customer.name)}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          disabled={busyId !== null && busyId !== customer.id}
                          onClick={() =>
                            setPending({
                              kind: 'customer',
                              id: customer.id,
                              label: customer.name,
                              detail: `${customer.name} will be removed permanently. Existing invoices keep their printed customer name.`,
                            })
                          }
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete permanently?"
        description={pending?.detail}
        confirmLabel="Delete permanently"
        destructive
        loading={permanentlyDeleteInvoice.isPending || permanentlyDeleteCustomer.isPending}
      />
    </div>
  )
}
