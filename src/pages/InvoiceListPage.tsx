import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FilterX,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Repeat2,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback'
import { Input, Field } from '@/components/ui/Form'
import { Menu } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useInvoices } from '@/hooks/useInvoices'
import { useCustomers } from '@/hooks/useCustomers'
import { useSettings } from '@/hooks/useSettings'
import {
  useDeleteInvoice,
  useDuplicateInvoice,
  useNextMonthInvoice,
} from '@/hooks/useMutations'
import {
  INVOICE_PAGE_SIZE,
  INVOICE_SORT_OPTIONS,
  PAYMENT_STATUSES,
} from '@/lib/constants'
import { downloadCsv, downloadExcelHtml } from '@/lib/download'
import { getErrorMessage } from '@/lib/errors'
import { formatAmount, formatDate, formatMoney, todayISO } from '@/lib/format'
import { invoiceService } from '@/services/invoiceService'
import type { InvoiceListFilters, InvoiceSummary, PaymentStatus } from '@/types/models'

export function InvoiceListPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const customers = useCustomers()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all')
  const [customerId, setCustomerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<NonNullable<InvoiceListFilters['sort']>>('date_desc')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSummary | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null)

  const filters: InvoiceListFilters = {
    search: debouncedSearch,
    status,
    customerId: customerId || undefined,
    from: from || undefined,
    to: to || undefined,
    sort,
    page,
    pageSize: INVOICE_PAGE_SIZE,
  }

  const invoices = useInvoices(filters)
  const duplicateInvoice = useDuplicateInvoice()
  const nextMonthInvoice = useNextMonthInvoice()
  const deleteInvoice = useDeleteInvoice()

  const currency = settings.data?.currency ?? 'LKR'
  const total = invoices.data?.total ?? 0
  const rows = invoices.data?.rows ?? []
  const busyId = duplicateInvoice.variables?.id ?? nextMonthInvoice.variables?.id

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, customerId, from, to, sort])

  const hasFilters =
    search !== '' || status !== 'all' || customerId !== '' || from !== '' || to !== '' || sort !== 'date_desc'

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setCustomerId('')
    setFrom('')
    setTo('')
    setSort('date_desc')
  }

  const handleDuplicate = async (invoice: InvoiceSummary) => {
    if (!settings.data) {
      toast.error('Settings are still loading. Try again in a moment.')
      return
    }
    try {
      const id = await duplicateInvoice.mutateAsync({ id: invoice.id, settings: settings.data })
      toast.success('Invoice duplicated as a new draft')
      navigate(`/invoices/${id}/edit`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleNextMonth = async (invoice: InvoiceSummary) => {
    if (!settings.data) {
      toast.error('Settings are still loading. Try again in a moment.')
      return
    }
    try {
      const id = await nextMonthInvoice.mutateAsync({ id: invoice.id, settings: settings.data })
      toast.success("Next month's invoice created as a draft")
      navigate(`/invoices/${id}/edit`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteInvoice.mutateAsync(deleteTarget.id)
      toast.success(`${deleteTarget.invoice_number} moved to the trash`)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleExport = async (kind: 'csv' | 'excel') => {
    setExporting(kind)
    try {
      const all = await invoiceService.exportAll()
      if (all.length === 0) {
        toast.error('There are no invoices to export yet.')
        return
      }
      const header = [
        'Invoice No',
        'Customer',
        'Project',
        'Invoice Date',
        'Due Date',
        'Subtotal',
        'Discount',
        'Tax %',
        'Total',
        'Paid',
        'Balance',
        'Status',
      ]
      const body = all.map((invoice) => [
        invoice.invoice_number,
        invoice.customer_name,
        invoice.project_name ?? '',
        formatDate(invoice.invoice_date),
        formatDate(invoice.due_date),
        formatAmount(invoice.subtotal),
        formatAmount(invoice.discount_amount),
        formatAmount(invoice.tax_rate),
        formatAmount(invoice.total),
        formatAmount(invoice.paid),
        formatAmount(invoice.balance),
        invoice.payment_status,
      ])
      const filename = `evolaire-invoices-${todayISO()}`
      if (kind === 'csv') {
        downloadCsv([header, ...body], `${filename}.csv`)
      } else {
        downloadExcelHtml([header, ...body], `${filename}.xls`, 'EVOLAIRE invoices')
      }
      toast.success(`Exported ${all.length} invoice${all.length === 1 ? '' : 's'}`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setExporting(null)
    }
  }

  const menuItems = (invoice: InvoiceSummary) => [
    { label: 'View invoice', icon: <Eye className="h-4 w-4" />, onSelect: () => navigate(`/invoices/${invoice.id}`) },
    { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => navigate(`/invoices/${invoice.id}/edit`) },
    {
      label: 'Download PDF',
      icon: <Download className="h-4 w-4" />,
      onSelect: () => navigate(`/invoices/${invoice.id}?action=download`),
    },
    {
      label: 'Print',
      icon: <Printer className="h-4 w-4" />,
      onSelect: () => navigate(`/invoices/${invoice.id}?action=print`),
    },
    {
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      disabled: busyId === invoice.id,
      separatorBefore: true,
      onSelect: () => void handleDuplicate(invoice),
    },
    {
      label: "Next month's invoice",
      icon: <Repeat2 className="h-4 w-4" />,
      disabled: busyId === invoice.id,
      onSelect: () => void handleNextMonth(invoice),
    },
    {
      label: 'Move to trash',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger' as const,
      separatorBefore: true,
      onSelect: () => setDeleteTarget(invoice),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Search, filter and manage every invoice."
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<FileSpreadsheet className="h-4 w-4" />}
              loading={exporting === 'excel'}
              onClick={() => void handleExport('excel')}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<FileText className="h-4 w-4" />}
              loading={exporting === 'csv'}
              onClick={() => void handleExport('csv')}
            >
              CSV
            </Button>
            <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/invoices/new')}>
              New invoice
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Invoice number or customer name"
                className="pl-9"
                aria-label="Search invoices"
              />
            </div>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as PaymentStatus | 'all')}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:focus:border-ink-500 dark:focus:ring-ink-800"
            >
              <option value="all">All statuses</option>
              {PAYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Customer">
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:focus:border-ink-500 dark:focus:ring-ink-800"
            >
              <option value="">All customers</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as NonNullable<InvoiceListFilters['sort']>)}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:focus:border-ink-500 dark:focus:ring-ink-800"
            >
              {INVOICE_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 xs:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field label="Date from">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Date to">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button
            variant="ghost"
            leadingIcon={<FilterX className="h-4 w-4" />}
            onClick={clearFilters}
            disabled={!hasFilters}
            className="justify-self-start xs:col-span-2 sm:col-span-1 sm:justify-self-auto"
          >
            Clear filters
          </Button>
        </div>
      </Card>

      {invoices.isError ? (
        <ErrorState
          title="Invoices could not load"
          description={getErrorMessage(invoices.error)}
          action={<Button variant="secondary" onClick={() => void invoices.refetch()}>Try again</Button>}
        />
      ) : invoices.isLoading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No invoices match those filters' : 'No invoices yet'}
          description={
            hasFilters
              ? 'Try a different search, status or date range.'
              : 'Create your first invoice and it will appear here.'
          }
          icon={<FileText className="h-5 w-5" />}
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/invoices/new')}>
                New invoice
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-visible">
          <div className="hidden overflow-x-auto overscroll-x-contain lg:block">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink-100 text-[11px] font-bold uppercase tracking-wide text-ink-400 dark:border-ink-800 dark:text-ink-500">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer / project</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                    className="cursor-pointer border-b border-ink-100 transition-colors last:border-0 hover:bg-ink-50/70 dark:border-ink-800/70 dark:hover:bg-ink-800/40"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-ink-900 dark:text-white">
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">
                        {invoice.customer_name || 'No customer'}
                      </p>
                      <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                        {invoice.project_name || '—'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-600 dark:text-ink-300">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-600 dark:text-ink-300">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-900 dark:text-white">
                      {formatMoney(invoice.total, currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-ink-600 dark:text-ink-300">
                      {formatMoney(invoice.paid, currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-900 dark:text-white">
                      {formatMoney(invoice.balance, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={invoice.payment_status} />
                    </td>
                    <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                      <Menu items={menuItems(invoice)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-ink-100 lg:hidden dark:divide-ink-800">
            {rows.map((invoice) => (
              <div key={invoice.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/invoices/${invoice.id}`} className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900 dark:text-white">
                      {invoice.invoice_number}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-600 dark:text-ink-300">
                      {invoice.customer_name || 'No customer'}
                    </p>
                    <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                      {invoice.project_name || '—'}
                    </p>
                  </Link>
                  <div className="flex flex-none items-center gap-1">
                    <StatusBadge status={invoice.payment_status} />
                    <Menu items={menuItems(invoice)} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-ink-50 p-2.5 text-xs dark:bg-ink-800/50">
                  <div className="min-w-0">
                    <p className="text-ink-400 dark:text-ink-500">Total</p>
                    <p className="mt-0.5 break-words font-semibold leading-tight tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(invoice.total, currency)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-ink-400 dark:text-ink-500">Paid</p>
                    <p className="mt-0.5 break-words font-semibold leading-tight tabular-nums text-ink-700 dark:text-ink-200">
                      {formatMoney(invoice.paid, currency)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-ink-400 dark:text-ink-500">Balance</p>
                    <p className="mt-0.5 break-words font-semibold leading-tight tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(invoice.balance, currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-400 dark:text-ink-500">
                  {formatDate(invoice.invoice_date)} · due {formatDate(invoice.due_date)}
                </p>
              </div>
            ))}
          </div>

          <div className="px-3 pb-4 sm:px-4">
            <Pagination page={page} pageSize={INVOICE_PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Move invoice to trash?"
        description={
          deleteTarget
            ? `${deleteTarget.invoice_number} will be hidden from your records. You can restore it from the Trash page.`
            : undefined
        }
        confirmLabel="Move to trash"
        destructive
        loading={deleteInvoice.isPending}
      />
    </div>
  )
}
