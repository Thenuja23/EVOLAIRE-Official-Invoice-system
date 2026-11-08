import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback'
import { Menu } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/Modal'
import { InvoiceExportLayer } from '@/components/invoice/InvoiceExportLayer'
import { InvoicePreview } from '@/components/invoice/InvoicePreview'
import { PaymentDialog } from '@/components/invoice/PaymentDialog'
import { useInvoice } from '@/hooks/useInvoices'
import { useSettings } from '@/hooks/useSettings'
import { useLogoUrl } from '@/hooks/useSettings'
import {
  useDeleteInvoice,
  useDeletePayment,
  useDuplicateInvoice,
  useNextMonthInvoice,
  usePermanentlyDeleteInvoice,
  useRestoreInvoice,
} from '@/hooks/useMutations'
import { PAYMENT_METHODS } from '@/lib/constants'
import { downloadElementAsPdf } from '@/lib/download'
import { getErrorMessage } from '@/lib/errors'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  normalizePhoneForWhatsApp,
  sanitizeFilename,
} from '@/lib/format'
import { advanceAmount, normalizeSnapshot, roundMoney } from '@/lib/invoice'
import { buildDocumentFromInvoice, PRINT_PAGE_STYLE } from '@/lib/invoiceDocument'
import type { Payment } from '@/types/models'

function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value
}

export function InvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const invoiceQuery = useInvoice(id)
  const settings = useSettings()
  const invoice = invoiceQuery.data
  const snapshot = useMemo(
    () => (invoice ? normalizeSnapshot(invoice.business_snapshot) : null),
    [invoice],
  )
  const logo = useLogoUrl(snapshot?.logo_path)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [defaultAmount, setDefaultAmount] = useState<number | undefined>(undefined)
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<Payment | null>(null)
  const [deleteInvoiceOpen, setDeleteInvoiceOpen] = useState(false)
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const paperRef = useRef<HTMLDivElement>(null)
  const actionHandled = useRef(false)

  const deleteInvoice = useDeleteInvoice()
  const restoreInvoice = useRestoreInvoice()
  const permanentDeleteInvoice = usePermanentlyDeleteInvoice()
  const deletePayment = useDeletePayment(id ?? '')
  const duplicateInvoice = useDuplicateInvoice()
  const nextMonthInvoice = useNextMonthInvoice()

  const currency = settings.data?.currency ?? 'LKR'
  const advancePercent = settings.data?.advance_percent ?? 40

  const documentData = useMemo(() => {
    if (!invoice || !snapshot) return null
    return buildDocumentFromInvoice({
      invoice,
      items: invoice.items,
      settings: settings.data,
      logoUrl: logo.data ?? null,
    })
  }, [invoice, snapshot, settings.data, logo.data])

  const downloadPdf = useCallback(
    async (silent = false) => {
      if (!invoice || !paperRef.current) return
      if (snapshot?.logo_path && logo.isLoading) {
        toast.error('The logo is still loading. Try again in a moment.')
        return
      }
      setDownloading(true)
      try {
        await downloadElementAsPdf(paperRef.current, `${sanitizeFilename(invoice.invoice_number)}.pdf`)
        if (!silent) toast.success('PDF downloaded')
      } catch (error) {
        toast.error(getErrorMessage(error))
      } finally {
        setDownloading(false)
      }
    },
    [invoice, snapshot?.logo_path, logo.isLoading],
  )

  const printInvoice = useReactToPrint({
    contentRef: paperRef,
    documentTitle: invoice ? sanitizeFilename(invoice.invoice_number) : 'invoice',
    pageStyle: PRINT_PAGE_STYLE,
  })

  const handlePrint = useCallback(() => {
    if (!paperRef.current) return
    printInvoice()
  }, [printInvoice])

  useEffect(() => {
    const action = searchParams.get('action')
    if (!action || actionHandled.current) return
    if (!documentData || !paperRef.current) return
    if (snapshot?.logo_path && logo.isLoading) return

    actionHandled.current = true
    const next = new URLSearchParams(searchParams)
    next.delete('action')
    setSearchParams(next, { replace: true })

    const frame = requestAnimationFrame(() => {
      if (action === 'download') void downloadPdf(true)
      if (action === 'print') handlePrint()
    })
    return () => cancelAnimationFrame(frame)
  }, [documentData, searchParams, setSearchParams, snapshot?.logo_path, logo.isLoading, downloadPdf, handlePrint])

  if (invoiceQuery.isLoading || settings.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[720px] w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (invoiceQuery.isError) {
    return (
      <ErrorState
        title="Invoice could not load"
        description={getErrorMessage(invoiceQuery.error)}
        action={<Button variant="secondary" onClick={() => void invoiceQuery.refetch()}>Try again</Button>}
      />
    )
  }

  if (!invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        description="It may have been permanently deleted."
        icon={<Ban className="h-5 w-5" />}
        action={
          <Button variant="secondary" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/invoices')}>
            Back to invoices
          </Button>
        }
      />
    )
  }

  const messageBody = [
    `Hi ${invoice.customer_name || 'there'},`,
    '',
    `Please find attached invoice ${invoice.invoice_number} for ${invoice.project_name || 'our services'}.`,
    `Total: ${formatMoney(invoice.total, currency)}`,
    `Paid: ${formatMoney(invoice.paid, currency)}`,
    `Balance due: ${formatMoney(invoice.balance, currency)}`,
    `Due date: ${formatDate(invoice.due_date)}`,
    '',
    'Thank you,',
    snapshot?.business_name || 'EVOLAIRE',
  ].join('\n')

  const handleWhatsApp = async () => {
    const phone = normalizePhoneForWhatsApp(invoice.customer?.phone)
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageBody)}`
    const popup = window.open('', '_blank')
    await downloadPdf(true)
    if (popup) popup.location.href = url
    else window.location.href = url
  }

  const handleEmail = async () => {
    const subject = `Invoice ${invoice.invoice_number} — ${invoice.project_name || 'EVOLAIRE'}`
    const url = `mailto:${invoice.customer?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`
    await downloadPdf(true)
    window.location.href = url
  }

  const handleDelete = async () => {
    try {
      await deleteInvoice.mutateAsync(invoice.id)
      toast.success(`${invoice.invoice_number} moved to the trash`)
      setDeleteInvoiceOpen(false)
      navigate('/invoices')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleRestore = async () => {
    try {
      await restoreInvoice.mutateAsync(invoice.id)
      toast.success(`${invoice.invoice_number} restored`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handlePermanentDelete = async () => {
    try {
      await permanentDeleteInvoice.mutateAsync(invoice.id)
      toast.success(`${invoice.invoice_number} permanently deleted`)
      setPermanentDeleteOpen(false)
      navigate('/invoices')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleDeletePayment = async () => {
    if (!deletePaymentTarget) return
    try {
      await deletePayment.mutateAsync(deletePaymentTarget.id)
      toast.success('Payment deleted')
      setDeletePaymentTarget(null)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleDuplicate = async () => {
    if (!settings.data) return
    try {
      const newId = await duplicateInvoice.mutateAsync({ id: invoice.id, settings: settings.data })
      toast.success('Invoice duplicated as a new draft')
      navigate(`/invoices/${newId}/edit`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleNextMonth = async () => {
    if (!settings.data) return
    try {
      const newId = await nextMonthInvoice.mutateAsync({ id: invoice.id, settings: settings.data })
      toast.success("Next month's invoice created as a draft")
      navigate(`/invoices/${newId}/edit`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const paidPercent = invoice.total > 0 ? Math.min(100, Math.round((invoice.paid / invoice.total) * 100)) : 0
  const advance = advanceAmount(invoice.total, advancePercent)
  const remainingAfterAdvance = roundMoney(invoice.total - advance)
  const openPayment = (amount?: number, payment?: Payment) => {
    setDefaultAmount(amount)
    setEditingPayment(payment ?? null)
    setPaymentOpen(true)
  }

  const isDeleted = Boolean(invoice.deleted_at)

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Invoices
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {invoice.invoice_number}
            <StatusBadge status={invoice.payment_status} />
            {isDeleted ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                In trash
              </span>
            ) : null}
          </span>
        }
        description={`${invoice.customer_name || 'No customer'}${invoice.project_name ? ` · ${invoice.project_name}` : ''}`}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
              disabled={isDeleted}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Download className="h-4 w-4" />}
              loading={downloading}
              onClick={() => void downloadPdf()}
            >
              PDF
            </Button>
            <Button variant="secondary" leadingIcon={<Printer className="h-4 w-4" />} onClick={handlePrint}>
              Print
            </Button>
            <Menu
              label="Share"
              items={[
                {
                  label: 'Share on WhatsApp',
                  icon: <MessageCircle className="h-4 w-4" />,
                  onSelect: () => void handleWhatsApp(),
                },
                {
                  label: 'Share by email',
                  icon: <Mail className="h-4 w-4" />,
                  onSelect: () => void handleEmail(),
                },
                {
                  label: 'Duplicate',
                  icon: <Copy className="h-4 w-4" />,
                  separatorBefore: true,
                  onSelect: () => void handleDuplicate(),
                },
                {
                  label: "Next month's invoice",
                  icon: <CalendarDays className="h-4 w-4" />,
                  onSelect: () => void handleNextMonth(),
                },
              ]}
            />
            <Menu
              items={[
                {
                  label: isDeleted ? 'Delete permanently' : 'Move to trash',
                  icon: <Trash2 className="h-4 w-4" />,
                  tone: 'danger',
                  onSelect: () => (isDeleted ? setPermanentDeleteOpen(true) : setDeleteInvoiceOpen(true)),
                },
              ]}
            />
          </>
        }
      />

      {isDeleted ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10">
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">This invoice is in the trash</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-200/70">
              Restore it to keep working with it, or delete it permanently. Invoice numbers are never reused.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<RotateCcw className="h-4 w-4" />}
              loading={restoreInvoice.isPending}
              onClick={() => void handleRestore()}
            >
              Restore
            </Button>
            <Button variant="danger" size="sm" leadingIcon={<Trash2 className="h-4 w-4" />} onClick={() => setPermanentDeleteOpen(true)}>
              Delete permanently
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-ink-100/60 p-2 sm:p-3 dark:bg-ink-950/60">
          {documentData ? (
            <InvoicePreview data={documentData} />
          ) : (
            <Skeleton className="h-[720px] w-full" />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Payment summary" />
            <div className="space-y-3 p-5 pt-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-ink-50 px-2 py-2.5 dark:bg-ink-800/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">Total</p>
                  <p className="mt-1 text-sm font-bold text-ink-900 dark:text-white">{formatMoney(invoice.total, currency)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-2 py-2.5 dark:bg-emerald-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/80 dark:text-emerald-400/80">Paid</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(invoice.paid, currency)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-2 py-2.5 dark:bg-amber-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/80 dark:text-amber-400/80">Balance</p>
                  <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">{formatMoney(invoice.balance, currency)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-ink-500 dark:text-ink-400">
                  <span>{paidPercent}% paid</span>
                  <span>Due {formatDate(invoice.due_date)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
              </div>

              <Button
                className="w-full"
                leadingIcon={<Plus className="h-4 w-4" />}
                disabled={invoice.balance <= 0 || isDeleted}
                onClick={() => openPayment(invoice.balance)}
              >
                Record payment
              </Button>
              <p className="text-center text-[11px] text-ink-400 dark:text-ink-500">
                Created {formatDateTime(invoice.created_at)} · Updated {formatDateTime(invoice.updated_at)}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Advance helper"
              description={`Based on the ${advancePercent}% advance set in Settings`}
              action={<CreditCard className="h-4 w-4 text-ink-400" />}
            />
            <div className="space-y-3 p-5 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">Advance ({advancePercent}%)</span>
                <span className="font-semibold text-ink-900 dark:text-white">{formatMoney(advance, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">After advance ({100 - advancePercent}%)</span>
                <span className="font-semibold text-ink-900 dark:text-white">
                  {formatMoney(remainingAfterAdvance, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-sm dark:border-ink-800">
                <span className="text-ink-500 dark:text-ink-400">Outstanding now</span>
                <span className="font-bold text-ink-900 dark:text-white">{formatMoney(invoice.balance, currency)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="soft"
                  size="sm"
                  disabled={invoice.balance <= 0 || isDeleted || advance <= 0}
                  onClick={() => openPayment(Math.min(advance, invoice.balance))}
                >
                  Record advance
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={invoice.balance <= 0 || isDeleted}
                  onClick={() => openPayment(invoice.balance)}
                >
                  Record balance
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              description={invoice.payments.length === 0 ? 'No payments yet' : `${invoice.payments.length} recorded`}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Record payment"
                  disabled={invoice.balance <= 0 || isDeleted}
                  onClick={() => openPayment(invoice.balance)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
            <div className="px-3 pb-4 pt-2">
              {invoice.payments.length === 0 ? (
                <EmptyState
                  compact
                  title="No payments recorded"
                  description="Record the advance or a full payment to keep the balance accurate."
                  icon={<CreditCard className="h-5 w-5" />}
                />
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="flex items-start justify-between gap-2 px-2 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900 dark:text-white">
                          {formatMoney(payment.amount, currency)}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                          {formatDate(payment.paid_on)} · {paymentMethodLabel(payment.method)}
                        </p>
                        {payment.note ? (
                          <p className="mt-1 line-clamp-2 text-xs text-ink-400 dark:text-ink-500">{payment.note}</p>
                        ) : null}
                      </div>
                      <Menu
                        items={[
                          {
                            label: 'Edit payment',
                            icon: <Pencil className="h-4 w-4" />,
                            onSelect: () => openPayment(undefined, payment),
                          },
                          {
                            label: 'Delete payment',
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: 'danger',
                            separatorBefore: true,
                            onSelect: () => setDeletePaymentTarget(payment),
                          },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2.5 text-sm dark:bg-ink-800/60">
                <span className="font-medium text-ink-600 dark:text-ink-300">Total paid</span>
                <span className="font-bold text-ink-900 dark:text-white">{formatMoney(invoice.paid, currency)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="space-y-2.5 p-5 pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Customer</span>
                <span className="truncate text-right font-medium text-ink-900 dark:text-white">
                  {invoice.customer_name || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Project</span>
                <span className="truncate text-right font-medium text-ink-900 dark:text-white">
                  {invoice.project_name || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Invoice date</span>
                <span className="text-right font-medium text-ink-900 dark:text-white">{formatDate(invoice.invoice_date)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Due date</span>
                <span className="flex items-center gap-1.5 text-right font-medium text-ink-900 dark:text-white">
                  <Clock3 className="h-3.5 w-3.5 text-ink-400" />
                  {formatDate(invoice.due_date)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Record</span>
                <span className="inline-flex items-center gap-1.5 text-right font-medium text-ink-900 dark:text-white">
                  {invoice.status === 'final' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Final
                    </>
                  ) : (
                    <>Draft</>
                  )}
                </span>
              </div>
              {invoice.notes ? (
                <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-300">{invoice.notes}</p>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {documentData ? <InvoiceExportLayer data={documentData} paperRef={paperRef} /> : null}

      <PaymentDialog
        open={paymentOpen}
        onClose={() => {
          setPaymentOpen(false)
          setEditingPayment(null)
          setDefaultAmount(undefined)
        }}
        invoiceId={invoice.id}
        currency={currency}
        remaining={invoice.balance}
        defaultAmount={defaultAmount}
        payment={editingPayment}
      />

      <ConfirmDialog
        open={Boolean(deletePaymentTarget)}
        onClose={() => setDeletePaymentTarget(null)}
        onConfirm={() => void handleDeletePayment()}
        title="Delete this payment?"
        description={
          deletePaymentTarget
            ? `${formatMoney(deletePaymentTarget.amount, currency)} recorded on ${formatDate(deletePaymentTarget.paid_on)} will be removed. The invoice balance will go up.`
            : undefined
        }
        confirmLabel="Delete payment"
        destructive
        loading={deletePayment.isPending}
      />

      <ConfirmDialog
        open={deleteInvoiceOpen}
        onClose={() => setDeleteInvoiceOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Move invoice to trash?"
        description={`${invoice.invoice_number} will be hidden from your records. You can restore it from the Trash page.`}
        confirmLabel="Move to trash"
        destructive
        loading={deleteInvoice.isPending}
      />

      <ConfirmDialog
        open={permanentDeleteOpen}
        onClose={() => setPermanentDeleteOpen(false)}
        onConfirm={() => void handlePermanentDelete()}
        title="Delete permanently?"
        description={`${invoice.invoice_number} and all of its payments will be gone for good. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        loading={permanentDeleteInvoice.isPending}
      />
    </div>
  )
}
