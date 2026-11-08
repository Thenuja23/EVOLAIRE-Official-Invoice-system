import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Modal'
import { CustomerDialog } from '@/components/customers/CustomerDialog'
import { InvoicePreview } from '@/components/invoice/InvoicePreview'
import { useCustomers } from '@/hooks/useCustomers'
import { useInvoice } from '@/hooks/useInvoices'
import { useLogoUrl, useSettings } from '@/hooks/useSettings'
import { addDaysISO, formatMoney, todayISO } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import {
  businessSnapshotFromSettings,
  buildInvoicePayload,
  calculateDisplayTotals,
  calculateLineTotal,
  DEFAULT_PAYMENT_TERMS,
  invoiceToFormValues,
  MAX_INVOICE_ITEMS,
} from '@/lib/invoice'
import { buildDocumentFromForm } from '@/lib/invoiceDocument'
import {
  invoiceFormSchema,
  type InvoiceFormValues,
} from '@/lib/validation'
import { invoiceService } from '@/services/invoiceService'
import type { Customer } from '@/types/models'

const emptyBusiness = {
  business_name: 'EVOLAIRE',
  email: '',
  phone: '',
  address: '',
  bank_account_name: '',
  bank_account_number: '',
  bank_name: '',
  bank_branch: '',
  logo_path: null,
}

const emptyValues: InvoiceFormValues = {
  status: 'draft',
  invoice_number: '',
  customer_id: null,
  customer_name: '',
  project_name: '',
  invoice_date: todayISO(),
  due_date: addDaysISO(todayISO(), 7),
  notes: '',
  payment_terms: DEFAULT_PAYMENT_TERMS,
  discount_amount: 0,
  tax_rate: 0,
  business: emptyBusiness,
  items: [{ description: '', unit: 1, price: 0 }],
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function InvoiceEditorPage() {
  const { id: routeId } = useParams()
  const isNew = !routeId
  const navigate = useNavigate()

  const settingsQuery = useSettings()
  const invoiceQuery = useInvoice(routeId)
  const customers = useCustomers()

  const [ready, setReady] = useState(false)
  const [savedId, setSavedId] = useState<string | undefined>(routeId)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [autosaveRevision, setAutosaveRevision] = useState(0)
  const [savingStatus, setSavingStatus] = useState<'draft' | 'final' | null>(null)
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [businessOpen, setBusinessOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const initialized = useRef(false)
  const numberRequested = useRef(false)
  const savingRef = useRef(false)
  const savedIdRef = useRef<string | undefined>(routeId)
  const dueTouched = useRef(false)

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: emptyValues,
    mode: 'onBlur',
  })

  const {
    register,
    control,
    handleSubmit,
    formState,
    reset,
    getValues,
    setValue,
    trigger,
    watch,
  } = form

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const values = watch()
  const logoPath = useWatch({ control, name: 'business.logo_path' })
  const logo = useLogoUrl(logoPath ?? undefined)
  const isDirty = formState.isDirty

  useEffect(() => {
    if (logo.isError) toast.error(`The business logo could not load: ${getErrorMessage(logo.error)}`)
  }, [logo.isError, logo.error])

  const settings = settingsQuery.data
  const currency = settings?.currency ?? 'LKR'

  useEffect(() => {
    if (initialized.current || !settings) return

    if (isNew) {
      const today = todayISO()
      const business = businessSnapshotFromSettings(settings)
      reset({
        ...emptyValues,
        invoice_date: today,
        due_date: addDaysISO(today, settings.default_due_days),
        payment_terms: settings.default_payment_terms,
        business: { ...business, logo_path: settings.logo_path },
      })
      setReady(true)
      initialized.current = true

      if (!numberRequested.current) {
        numberRequested.current = true
        invoiceService
          .generateNumber()
          .then((number) => setValue('invoice_number', number, { shouldDirty: false }))
          .catch((error) => toast.error(getErrorMessage(error)))
      }
      return
    }

    if (!invoiceQuery.data) return
    const invoice = invoiceQuery.data
    reset(invoiceToFormValues(invoice, invoice.items, settings))
    setSavedId(invoice.id)
    savedIdRef.current = invoice.id
    dueTouched.current = true
    setReady(true)
    initialized.current = true
  }, [settings, isNew, invoiceQuery.data, reset, setValue])

  useEffect(() => {
    savedIdRef.current = savedId
  }, [savedId])

  const invoiceDate = watch('invoice_date')
  const dueDate = watch('due_date')

  useEffect(() => {
    if (!ready || dueTouched.current || !settings || !invoiceDate) return
    const next = addDaysISO(invoiceDate, settings.default_due_days)
    if (next !== dueDate) setValue('due_date', next, { shouldDirty: true })
  }, [invoiceDate, dueDate, ready, settings, setValue])

  // Keep one empty row ready at the end, up to the 14-row template limit.
  const watchedItems = useWatch({ control, name: 'items' })
  useEffect(() => {
    if (!ready || !watchedItems) return
    const last = watchedItems[watchedItems.length - 1]
    if (
      watchedItems.length < MAX_INVOICE_ITEMS &&
      last &&
      (last.description?.trim() !== '' || Number(last.price) > 0)
    ) {
      append({ description: '', unit: 1, price: 0 })
    }
  }, [watchedItems, ready, append])

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Autosave drafts (or updates to an already-final invoice) a few seconds
  // after the last edit. Totals are always recalculated by the database.
  useEffect(() => {
    if (!ready || !isDirty || !settings) return

    const timer = window.setTimeout(async () => {
      if (savingRef.current) return
      const current = getValues()
      const parsed = invoiceFormSchema.safeParse(current)
      if (!parsed.success) return

      const submittedValues = JSON.stringify(current)
      savingRef.current = true
      setSaveState('saving')
      try {
        const id = await invoiceService.save(
          buildInvoicePayload(parsed.data, settings, {
            id: savedIdRef.current,
            status: parsed.data.status,
            logoPath: current.business.logo_path ?? settings.logo_path,
          }),
        )
        savedIdRef.current = id
        setSavedId(id)
        setLastSavedAt(new Date())
        const latestValues = getValues()
        if (JSON.stringify(latestValues) === submittedValues) {
          reset(latestValues)
          setSaveState('saved')
        } else {
          setSaveState('idle')
          setAutosaveRevision((revision) => revision + 1)
        }
      } catch (error) {
        setSaveState('error')
        toast.error(getErrorMessage(error))
      } finally {
        savingRef.current = false
      }
    }, 2800)

    return () => window.clearTimeout(timer)
  }, [ready, isDirty, settings, values, getValues, reset, autosaveRevision])

  const generateNumber = async () => {
    try {
      const number = await invoiceService.generateNumber()
      setValue('invoice_number', number, { shouldDirty: true, shouldValidate: true })
      toast.success('New invoice number generated')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const copyBusinessFromSettings = () => {
    if (!settings) return
    const business = businessSnapshotFromSettings(settings)
    setValue('business', { ...business, logo_path: settings.logo_path }, { shouldDirty: true })
    toast.success('Business details copied from Settings')
  }

  const onCustomerChange = (customerId: string) => {
    const customer = (customers.data ?? []).find((item) => item.id === customerId)
    setValue('customer_id', customer ? customer.id : null, { shouldDirty: true })
    if (customer) setValue('customer_name', customer.name, { shouldDirty: true })
  }

  const onCustomerSaved = (customer: Customer) => {
    setValue('customer_id', customer.id, { shouldDirty: true })
    setValue('customer_name', customer.name, { shouldDirty: true })
    void customers.refetch()
  }

  const doSave = async (status: 'draft' | 'final') => {
    if (!settings) return
    setValue('status', status, { shouldDirty: true })
    const valid = await trigger()
    if (!valid) {
      toast.error('Please fix the highlighted fields before saving.')
      return
    }

    const current = getValues()
    savingRef.current = true
    setSavingStatus(status)
    try {
      const id = await invoiceService.save(
        buildInvoicePayload(current, settings, {
          id: savedIdRef.current,
          status,
          logoPath: current.business.logo_path ?? settings.logo_path,
        }),
      )
      savedIdRef.current = id
      setSavedId(id)
      toast.success(status === 'final' ? 'Invoice saved as final' : 'Draft saved')
      navigate(`/invoices/${id}`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      savingRef.current = false
      setSavingStatus(null)
    }
  }

  const onSubmit = handleSubmit(() => doSave(getValues('status')))

  const handleCancel = () => {
    if (isDirty) setCancelOpen(true)
    else navigate('/invoices')
  }

  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="Settings could not load"
        description={getErrorMessage(settingsQuery.error)}
        action={<Button variant="secondary" onClick={() => void settingsQuery.refetch()}>Try again</Button>}
      />
    )
  }

  if (!settings || !ready || (!isNew && invoiceQuery.isLoading)) {
    if (!isNew && invoiceQuery.isError) {
      return (
        <ErrorState
          title="Invoice could not load"
          description={getErrorMessage(invoiceQuery.error)}
          action={<Button variant="secondary" onClick={() => void invoiceQuery.refetch()}>Try again</Button>}
        />
      )
    }
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-52 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[760px] w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!isNew && !invoiceQuery.data) {
    return (
      <EmptyState
        title="Invoice not found"
        description="It may have been permanently deleted."
        icon={<FileText className="h-5 w-5" />}
        action={
          <Button variant="secondary" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/invoices')}>
            Back to invoices
          </Button>
        }
      />
    )
  }

  const totals = calculateDisplayTotals(values.items, {
    discountAmount: values.discount_amount,
    taxRate: values.tax_rate,
    discountEnabled: settings.discount_enabled,
    taxEnabled: settings.tax_enabled,
  })

  const previewData = buildDocumentFromForm({
    values,
    settings,
    logoUrl: logo.data ?? null,
  })

  const autosaveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Could not save'
        : isDirty
          ? 'Unsaved changes'
          : saveState === 'saved' && lastSavedAt
            ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Autosave on'

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
        title={isNew ? 'New invoice' : `Edit ${getValues('invoice_number') || 'invoice'}`}
        description="Totals are calculated by the database. The live preview matches the PDF and print output."
        actions={
          <>
            <span
              className={
                saveState === 'error'
                  ? 'inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400'
                  : 'inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 dark:text-ink-400'
              }
            >
              {saveState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saveState === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : isDirty ? (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {autosaveLabel}
            </span>
            <Button variant="secondary" onClick={handleCancel} disabled={Boolean(savingStatus)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Save className="h-4 w-4" />}
              loading={savingStatus === 'draft'}
              disabled={Boolean(savingStatus)}
              onClick={() => void doSave('draft')}
            >
              Save draft
            </Button>
            <Button
              leadingIcon={<Check className="h-4 w-4" />}
              loading={savingStatus === 'final'}
              disabled={Boolean(savingStatus)}
              onClick={() => void doSave('final')}
            >
              Save as final
            </Button>
          </>
        }
      />

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)] 2xl:grid-cols-[minmax(0,1fr)_620px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Invoice details" description="Number, dates and project." />
            <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
              <Field
                label="Invoice number"
                htmlFor="invoice-number"
                required
                error={formState.errors.invoice_number?.message}
                className="sm:col-span-2"
              >
                <div className="flex flex-col gap-2 xs:flex-row">
                  <Input
                    id="invoice-number"
                    placeholder="EVO-2026-114"
                    className="min-w-0 flex-1"
                    {...register('invoice_number')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-none"
                    leadingIcon={<RefreshCw className="h-4 w-4" />}
                    onClick={() => void generateNumber()}
                  >
                    Generate
                  </Button>
                </div>
              </Field>

              <Field label="Invoice date" htmlFor="invoice-date" required error={formState.errors.invoice_date?.message}>
                <Input id="invoice-date" type="date" {...register('invoice_date')} />
              </Field>
              <Field label="Due date" htmlFor="due-date" required error={formState.errors.due_date?.message}>
                <Input
                  id="due-date"
                  type="date"
                  {...register('due_date', {
                    onChange: () => {
                      dueTouched.current = true
                    },
                  })}
                />
              </Field>

              <Field label="Project" htmlFor="project-name" error={formState.errors.project_name?.message} className="sm:col-span-2">
                <Input id="project-name" placeholder="e.g. Soul of seafood" {...register('project_name')} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Customer"
              description="Pick an existing customer or add one inline."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<UserPlus className="h-4 w-4" />}
                  onClick={() => setCustomerDialogOpen(true)}
                >
                  New customer
                </Button>
              }
            />
            <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
              <Field label="Existing customer" htmlFor="customer-select">
                <Select
                  id="customer-select"
                  value={values.customer_id ?? ''}
                  onChange={(event) => onCustomerChange(event.target.value)}
                >
                  <option value="">No linked customer</option>
                  {(customers.data ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Printed customer name"
                htmlFor="customer-name"
                required
                error={formState.errors.customer_name?.message}
              >
                <Input id="customer-name" placeholder="Maneesha Vithanage" {...register('customer_name')} />
              </Field>
              {values.customer_id ? (
                <p className="sm:col-span-2 -mt-1 flex items-center gap-1.5 text-xs text-ink-400 dark:text-ink-500">
                  <Users className="h-3.5 w-3.5" />
                  The customer record stays linked for stats. You can still edit the printed name above.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Line items"
              description={`Up to ${MAX_INVOICE_ITEMS} lines. Empty rows are ignored.`}
              action={<span className="text-xs font-medium text-ink-400 dark:text-ink-500">{fields.length}/{MAX_INVOICE_ITEMS}</span>}
            />
            <div className="line-items p-5 pt-4">
              <div className="line-items-head gap-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                <span>Description</span>
                <span>Unit</span>
                <span>Price</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 sm:divide-y dark:divide-ink-800 dark:border-ink-700">
                {fields.map((field, index) => {
                  const unit = Number(values.items?.[index]?.unit) || 0
                  const price = Number(values.items?.[index]?.price) || 0
                  const lineTotal = calculateLineTotal(unit, price)
                  const itemErrors = formState.errors.items?.[index]

                  return (
                    <div
                      key={field.id}
                      className="line-item-row grid grid-cols-2 gap-2 bg-white p-3 dark:bg-ink-900"
                    >
                      <div className="line-item-desc col-span-2 min-w-0">
                        <span className="line-item-compact-label mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                          Description
                        </span>
                        <Input
                          placeholder={`Line ${index + 1} description`}
                          aria-label={`Description for line ${index + 1}`}
                          {...register(`items.${index}.description`)}
                        />
                        {itemErrors?.description?.message ? (
                          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                            {itemErrors.description.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <span className="line-item-compact-label mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                          Unit
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="1"
                          inputMode="decimal"
                          aria-label={`Unit for line ${index + 1}`}
                          {...register(`items.${index}.unit`, { valueAsNumber: true })}
                        />
                        {itemErrors?.unit?.message ? (
                          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                            {itemErrors.unit.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <span className="line-item-compact-label mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                          Price
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          aria-label={`Price for line ${index + 1}`}
                          {...register(`items.${index}.price`, { valueAsNumber: true })}
                        />
                        {itemErrors?.price?.message ? (
                          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                            {itemErrors.price.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="line-item-total min-w-0">
                        <span className="line-item-compact-label mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                          Line total
                        </span>
                        <span className="block break-words text-sm font-semibold leading-tight tabular-nums text-ink-900 dark:text-white">
                          {formatMoney(lineTotal, currency)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove line ${index + 1}`}
                        className="line-item-remove justify-self-end self-end text-ink-400 hover:text-rose-600 dark:text-ink-500 dark:hover:text-rose-400"
                        onClick={() => {
                          if (fields.length === 1) {
                            setValue('items.0.description', '', { shouldDirty: true })
                            setValue('items.0.unit', 1, { shouldDirty: true })
                            setValue('items.0.price', 0, { shouldDirty: true })
                          } else {
                            remove(index)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Plus className="h-4 w-4" />}
                  disabled={fields.length >= MAX_INVOICE_ITEMS}
                  onClick={() => append({ description: '', unit: 1, price: 0 })}
                >
                  Add line
                </Button>
                <p className="text-xs text-ink-400 dark:text-ink-500">
                  Line totals are calculated from unit × price.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Totals" description="A read-only preview. The database writes the final values." />
            <div className="space-y-2 p-5 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500 dark:text-ink-400">Subtotal</span>
                <span className="font-semibold text-ink-900 dark:text-white">{formatMoney(totals.subtotal, currency)}</span>
              </div>

              {settings.discount_enabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-500 dark:text-ink-400">Discount</span>
                  <div className="w-36">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      aria-label="Discount amount"
                      className="h-9 text-right"
                      {...register('discount_amount', { valueAsNumber: true })}
                    />
                  </div>
                </div>
              ) : null}

              {settings.tax_enabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-500 dark:text-ink-400">Tax rate (%)</span>
                  <div className="w-36">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      inputMode="decimal"
                      aria-label="Tax rate"
                      className="h-9 text-right"
                      {...register('tax_rate', { valueAsNumber: true })}
                    />
                  </div>
                </div>
              ) : null}

              {settings.tax_enabled ? (
                <div className="flex items-center justify-between">
                  <span className="text-ink-500 dark:text-ink-400">Tax</span>
                  <span className="font-semibold text-ink-900 dark:text-white">{formatMoney(totals.tax, currency)}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-ink-100 pt-3 dark:border-ink-800">
                <span className="text-sm font-bold text-ink-900 dark:text-white">Total</span>
                <span className="text-lg font-bold text-ink-950 dark:text-white">{formatMoney(totals.total, currency)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes & payment terms" description="Both print on the invoice." />
            <div className="space-y-4 p-5 pt-4">
              <Field label="Notes" htmlFor="invoice-notes" error={formState.errors.notes?.message} hint="Optional. Appears below the payment terms.">
                <Textarea id="invoice-notes" rows={2} placeholder="Anything the customer should know" {...register('notes')} />
              </Field>
              <Field
                label="Payment terms"
                htmlFor="payment-terms"
                error={formState.errors.payment_terms?.message}
                hint="Pre-filled from Settings, editable for this invoice."
              >
                <Textarea id="payment-terms" rows={4} {...register('payment_terms')} />
              </Field>
            </div>
          </Card>

          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              onClick={() => setBusinessOpen((open) => !open)}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold text-ink-950 dark:text-white">
                  <Building2 className="h-4 w-4 text-ink-400" /> Business details on this invoice
                </p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  Pre-filled from Settings. Editing here only changes this invoice.
                </p>
              </div>
              {businessOpen ? (
                <ChevronUp className="h-4 w-4 flex-none text-ink-400" />
              ) : (
                <ChevronDown className="h-4 w-4 flex-none text-ink-400" />
              )}
            </button>
            {businessOpen ? (
              <div className="border-t border-ink-100 p-5 dark:border-ink-800">
                <div className="mb-4 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leadingIcon={<Copy className="h-4 w-4" />}
                    onClick={copyBusinessFromSettings}
                  >
                    Copy from Settings
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business name" htmlFor="business-name" error={formState.errors.business?.business_name?.message} className="sm:col-span-2">
                    <Input id="business-name" {...register('business.business_name')} />
                  </Field>
                  <Field label="Email" htmlFor="business-email" error={formState.errors.business?.email?.message}>
                    <Input id="business-email" type="email" {...register('business.email')} />
                  </Field>
                  <Field label="Phone" htmlFor="business-phone" error={formState.errors.business?.phone?.message}>
                    <Input id="business-phone" {...register('business.phone')} />
                  </Field>
                  <Field label="Address" htmlFor="business-address" error={formState.errors.business?.address?.message} className="sm:col-span-2">
                    <Textarea id="business-address" rows={2} {...register('business.address')} />
                  </Field>
                  <Field label="Account holder" htmlFor="bank-account-name" error={formState.errors.business?.bank_account_name?.message}>
                    <Input id="bank-account-name" {...register('business.bank_account_name')} />
                  </Field>
                  <Field label="Account number" htmlFor="bank-account-number" error={formState.errors.business?.bank_account_number?.message}>
                    <Input id="bank-account-number" {...register('business.bank_account_number')} />
                  </Field>
                  <Field label="Bank" htmlFor="bank-name" error={formState.errors.business?.bank_name?.message}>
                    <Input id="bank-name" {...register('business.bank_name')} />
                  </Field>
                  <Field label="Branch" htmlFor="bank-branch" error={formState.errors.business?.bank_branch?.message}>
                    <Input id="bank-branch" {...register('business.bank_branch')} />
                  </Field>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="flex flex-col-reverse gap-2 pb-8 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={Boolean(savingStatus)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              leadingIcon={<Save className="h-4 w-4" />}
              loading={savingStatus === 'draft'}
              disabled={Boolean(savingStatus)}
              onClick={() => void doSave('draft')}
            >
              Save draft
            </Button>
            <Button
              type="submit"
              leadingIcon={<Check className="h-4 w-4" />}
              loading={savingStatus === 'final'}
              disabled={Boolean(savingStatus)}
            >
              Save as final
            </Button>
          </div>
        </div>

        <div className="min-w-0 self-start xl:sticky xl:top-20">
          <Card className="w-full min-w-0 bg-ink-100/60 p-2 sm:p-3 dark:bg-ink-950/60">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                Live preview
              </p>
              <p className="text-[11px] text-ink-400 dark:text-ink-500">A4 · same as PDF/print</p>
            </div>
            <div className="max-w-full overflow-hidden rounded-sm bg-white">
              <InvoicePreview data={previewData} />
            </div>
          </Card>
        </div>
      </form>

      <CustomerDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onSaved={onCustomerSaved}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          setCancelOpen(false)
          navigate('/invoices')
        }}
        title="Discard unsaved changes?"
        description="Some edits have not been saved yet. Autosaved drafts are already stored and remain in your invoice list."
        confirmLabel="Leave without saving"
        destructive
      />
    </div>
  )
}
