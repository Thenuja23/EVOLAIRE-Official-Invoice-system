import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import {
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from '@/components/ui/Feedback'
import { StatCard } from '@/components/ui/Data'
import { ConfirmDialog } from '@/components/ui/Modal'
import { CustomerDialog } from '@/components/customers/CustomerDialog'
import { useCustomer, useCustomerStats } from '@/hooks/useCustomers'
import { useInvoices } from '@/hooks/useInvoices'
import { useSettings } from '@/hooks/useSettings'
import { useDeleteCustomer } from '@/hooks/useMutations'
import { INVOICE_PAGE_SIZE } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatDateTime, formatMoney, initials } from '@/lib/format'

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const customer = useCustomer(id)
  const stats = useCustomerStats(id)
  const settings = useSettings()
  const invoices = useInvoices({
    customerId: id,
    page: 1,
    pageSize: INVOICE_PAGE_SIZE,
    sort: 'date_desc',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteCustomer = useDeleteCustomer()

  const currency = settings.data?.currency ?? 'LKR'

  if (customer.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[106px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (customer.isError) {
    return (
      <ErrorState
        title="Customer could not load"
        description={getErrorMessage(customer.error)}
        action={
          <Button variant="secondary" onClick={() => void customer.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!customer.data) {
    return (
      <EmptyState
        title="Customer not found"
        description="It may have been permanently deleted."
        icon={<UserX className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            leadingIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate('/customers')}
          >
            Back to customers
          </Button>
        }
      />
    )
  }

  const record = customer.data
  const invoiceRows = invoices.data?.rows ?? []
  const total = invoices.data?.total ?? 0

  const handleDelete = async () => {
    try {
      await deleteCustomer.mutateAsync(record.id)
      toast.success(`${record.name} moved to the trash`)
      setDeleteOpen(false)
      navigate('/customers')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Customers
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-100">
              {initials(record.name)}
            </span>
            {record.name}
          </span>
        }
        description={`Customer since ${formatDate(record.created_at)}`}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setDeleteOpen(true)}
            >
              Move to trash
            </Button>
            <Button
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/invoices/new')}
            >
              New invoice
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[106px] rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Invoices"
              value={String(stats.data?.invoice_count ?? 0)}
              icon={<ReceiptText className="h-4 w-4" />}
              tone="violet"
              hint="Final invoices for this customer"
            />
            <StatCard
              label="Billed"
              value={formatMoney(stats.data?.billed ?? 0, currency)}
              icon={<FileText className="h-4 w-4" />}
              hint={`Paid ${formatMoney(stats.data?.paid ?? 0, currency)}`}
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(stats.data?.outstanding ?? 0, currency)}
              icon={<ArrowUpRight className="h-4 w-4" />}
              tone="amber"
              hint="Unpaid balance across invoices"
            />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader
            title="Invoices"
            description={
              total === 0
                ? 'No invoices for this customer yet'
                : `${total} invoice${total === 1 ? '' : 's'} linked to this customer`
            }
            action={
              <Link
                to="/invoices"
                className="text-xs font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
              >
                All invoices
              </Link>
            }
          />
          <div className="px-3 pb-4 pt-2">
            {invoices.isLoading ? (
              <div className="space-y-2 px-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : invoiceRows.length === 0 ? (
              <EmptyState
                compact
                title="No invoices yet"
                description="Create an invoice and select this customer to start their history."
                icon={<FileText className="h-5 w-5" />}
              />
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
                {invoiceRows.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-900 dark:text-white">
                          {invoice.invoice_number}
                        </span>
                        <StatusBadge status={invoice.payment_status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                        {invoice.project_name || 'No project'} · {formatDate(invoice.invoice_date)}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink-900 dark:text-white">
                          {formatMoney(invoice.total, currency)}
                        </p>
                        <p className="text-[11px] text-ink-400 dark:text-ink-500">
                          {formatMoney(invoice.balance, currency)} due
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-ink-300 dark:text-ink-600" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader title="Contact" />
            <div className="space-y-3 p-5 pt-4 text-sm">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 flex-none text-ink-400" />
                <span className="min-w-0 break-all text-ink-700 dark:text-ink-200">
                  {record.email || 'No email added'}
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-ink-400" />
                <span className="min-w-0 whitespace-pre-wrap text-ink-700 dark:text-ink-200">
                  {record.address || 'No address added'}
                </span>
              </div>
              <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                  Phone
                </p>
                <p className="mt-1 text-ink-700 dark:text-ink-200">
                  {record.phone || 'No phone added'}
                </p>
              </div>
              {record.notes ? (
                <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-600 dark:text-ink-300">
                    {record.notes}
                  </p>
                </div>
              ) : null}
              <p className="border-t border-ink-100 pt-3 text-[11px] text-ink-400 dark:border-ink-800 dark:text-ink-500">
                Updated {formatDateTime(record.updated_at)}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <CustomerDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={record}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Move customer to trash?"
        description={`${record.name} will be hidden from your customer list. Existing invoices keep their printed customer name and stay untouched.`}
        confirmLabel="Move to trash"
        destructive
        loading={deleteCustomer.isPending}
      />
    </div>
  )
}
