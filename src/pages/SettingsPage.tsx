import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  DatabaseBackup,
  Download,
  FileJson,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input, Textarea, Toggle } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useInvoiceCount } from '@/hooks/useInvoices'
import {
  useLoadSampleData,
  useSettings,
  useUpdateSettings,
  useUploadLogo,
  useRemoveLogo,
  useLogoUrl,
} from '@/hooks/useSettings'
import { CURRENCY_SUGGESTIONS } from '@/lib/constants'
import { downloadJson } from '@/lib/download'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, sanitizeFilename, todayISO } from '@/lib/format'
import { formatInvoiceNumberPreview } from '@/lib/invoice'
import { readFileAsText } from '@/lib/download'
import { backupFileSchema, settingsSchema, type SettingsValues } from '@/lib/validation'
import { backupService } from '@/services/backupService'
import type { BackupFile, Settings } from '@/types/models'

function toFormValues(settings: Settings): SettingsValues {
  return {
    business_name: settings.business_name,
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    address: settings.address ?? '',
    bank_account_name: settings.bank_account_name ?? '',
    bank_account_number: settings.bank_account_number ?? '',
    bank_name: settings.bank_name ?? '',
    bank_branch: settings.bank_branch ?? '',
    default_payment_terms: settings.default_payment_terms,
    currency: settings.currency,
    invoice_prefix: settings.invoice_prefix,
    invoice_format: settings.invoice_format,
    next_invoice_seq: settings.next_invoice_seq,
    default_due_days: settings.default_due_days,
    advance_percent: settings.advance_percent,
    tax_enabled: settings.tax_enabled,
    discount_enabled: settings.discount_enabled,
  }
}

export function SettingsPage() {
  const settingsQuery = useSettings()
  const invoiceCount = useInvoiceCount()
  const updateSettings = useUpdateSettings()
  const uploadLogo = useUploadLogo()
  const removeLogo = useRemoveLogo()
  const loadSampleData = useLoadSampleData()
  const queryClient = useQueryClient()

  const logoInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  const [logoConfirmOpen, setLogoConfirmOpen] = useState(false)
  const [sampleConfirmOpen, setSampleConfirmOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null)
  const [restoreName, setRestoreName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const settings = settingsQuery.data
  const logo = useLogoUrl(settings?.logo_path)

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings ? toFormValues(settings) : undefined,
  })

  useEffect(() => {
    if (settings) form.reset(toFormValues(settings))
  }, [settings, form])

  const currency = form.watch('currency') || settings?.currency || 'LKR'
  const previewNumber = formatInvoiceNumberPreview({
    invoice_prefix: form.watch('invoice_prefix') || 'EVO',
    invoice_format: form.watch('invoice_format') || '{prefix}-{year}-{seq}',
    next_invoice_seq: Number(form.watch('next_invoice_seq')) || 1,
  })

  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="Settings could not load"
        description={getErrorMessage(settingsQuery.error)}
        action={
          <Button variant="secondary" onClick={() => void settingsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!settings) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateSettings.mutateAsync(values)
      toast.success('Settings saved')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  })

  const handleLogoChange = async (file: File | undefined) => {
    if (!file) return
    try {
      await uploadLogo.mutateAsync(file)
      toast.success('Logo updated')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    try {
      await removeLogo.mutateAsync()
      toast.success('Logo removed')
      setLogoConfirmOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleSampleData = async () => {
    try {
      await loadSampleData.mutateAsync()
      toast.success('Sample invoice loaded')
      setSampleConfirmOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const backup = await backupService.exportAll()
      downloadJson(backup, `evolaire-backup-${todayISO()}.json`)
      toast.success('Backup downloaded')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const handleBackupFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const parsed = backupFileSchema.safeParse(JSON.parse(text))
      if (!parsed.success) {
        toast.error('That file is not a valid EVOLAIRE backup.')
        return
      }
      const tables = parsed.data.tables
      setRestoreTarget({
        format: 'evolaire-backup',
        version: parsed.data.version ?? 1,
        exported_at: parsed.data.exported_at ?? new Date().toISOString(),
        tables: {
          settings: tables.settings ?? [],
          customers: tables.customers ?? [],
          invoices: tables.invoices ?? [],
          invoice_items: tables.invoice_items ?? [],
          payments: tables.payments ?? [],
        },
      })
      setRestoreName(file.name)
    } catch {
      toast.error('The backup file could not be read. Choose the JSON file exported from this app.')
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = ''
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const counts = await backupService.restore(restoreTarget)
      queryClient.clear()
      toast.success(
        `Restore complete: ${counts.invoices} invoices, ${counts.customers} customers and ${counts.payments} payments in the workspace.`,
      )
      setRestoreTarget(null)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  const sampleDisabled = (invoiceCount.data ?? 0) > 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Business details, invoice defaults and backups. Changes apply to new invoices; existing invoices keep their original details."
        actions={
          <Button
            type="submit"
            form="settings-form"
            leadingIcon={<Save className="h-4 w-4" />}
            loading={updateSettings.isPending}
          >
            Save settings
          </Button>
        }
      />

      <form id="settings-form" onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Business details"
              description="Shown in the top-left of every invoice, along with the logo."
              action={<Building2 className="h-4 w-4 text-ink-400" />}
            />
            <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
              <Field
                label="Business name"
                htmlFor="settings-business-name"
                required
                error={form.formState.errors.business_name?.message}
                className="sm:col-span-2"
              >
                <Input id="settings-business-name" {...form.register('business_name')} />
              </Field>
              <Field label="Email" htmlFor="settings-email" error={form.formState.errors.email?.message}>
                <Input id="settings-email" type="email" placeholder="hello@evolaire.lk" {...form.register('email')} />
              </Field>
              <Field label="Phone" htmlFor="settings-phone" error={form.formState.errors.phone?.message}>
                <Input id="settings-phone" placeholder="+94 77 123 4567" {...form.register('phone')} />
              </Field>
              <Field
                label="Address"
                htmlFor="settings-address"
                error={form.formState.errors.address?.message}
                className="sm:col-span-2"
              >
                <Textarea id="settings-address" rows={2} {...form.register('address')} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Bank details"
              description="Printed under Payment details on the invoice."
              action={<Wallet className="h-4 w-4 text-ink-400" />}
            />
            <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
              <Field
                label="Account holder"
                htmlFor="settings-account-name"
                error={form.formState.errors.bank_account_name?.message}
              >
                <Input id="settings-account-name" {...form.register('bank_account_name')} />
              </Field>
              <Field
                label="Account number"
                htmlFor="settings-account-number"
                error={form.formState.errors.bank_account_number?.message}
              >
                <Input id="settings-account-number" {...form.register('bank_account_number')} />
              </Field>
              <Field label="Bank" htmlFor="settings-bank" error={form.formState.errors.bank_name?.message}>
                <Input id="settings-bank" {...form.register('bank_name')} />
              </Field>
              <Field label="Branch" htmlFor="settings-branch" error={form.formState.errors.bank_branch?.message}>
                <Input id="settings-branch" {...form.register('bank_branch')} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Invoice defaults"
              description="Used to pre-fill new invoices. Each invoice can still be edited afterwards."
            />
            <div className="space-y-4 p-5 pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Currency" htmlFor="settings-currency" error={form.formState.errors.currency?.message}>
                  <Input
                    id="settings-currency"
                    list="currency-suggestions"
                    maxLength={8}
                    {...form.register('currency')}
                  />
                  <datalist id="currency-suggestions">
                    {CURRENCY_SUGGESTIONS.map((code) => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label="Default due days"
                  htmlFor="settings-due-days"
                  error={form.formState.errors.default_due_days?.message}
                >
                  <Input
                    id="settings-due-days"
                    type="number"
                    min="0"
                    max="365"
                    step="1"
                    {...form.register('default_due_days', { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Advance %"
                  htmlFor="settings-advance"
                  error={form.formState.errors.advance_percent?.message}
                  hint="Used by the advance helper."
                >
                  <Input
                    id="settings-advance"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    {...form.register('advance_percent', { valueAsNumber: true })}
                  />
                </Field>
              </div>

              <Field
                label="Default payment terms"
                htmlFor="settings-terms"
                required
                error={form.formState.errors.default_payment_terms?.message}
              >
                <Textarea id="settings-terms" rows={5} {...form.register('default_payment_terms')} />
              </Field>

              <div className="grid gap-3 rounded-xl border border-ink-100 p-4 sm:grid-cols-2 dark:border-ink-800">
                <Toggle
                  id="settings-tax"
                  checked={form.watch('tax_enabled')}
                  onChange={(checked) => form.setValue('tax_enabled', checked, { shouldDirty: true })}
                  label="Enable tax"
                  description="Show an optional tax rate field on invoices."
                />
                <Toggle
                  id="settings-discount"
                  checked={form.watch('discount_enabled')}
                  onChange={(checked) => form.setValue('discount_enabled', checked, { shouldDirty: true })}
                  label="Enable discount"
                  description="Show an optional discount amount field on invoices."
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Invoice numbering"
              description="The sequence is consumed only when you click Generate in the editor, so numbers are never reused."
              action={<RefreshCw className="h-4 w-4 text-ink-400" />}
            />
            <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
              <Field label="Prefix" htmlFor="settings-prefix" error={form.formState.errors.invoice_prefix?.message}>
                <Input id="settings-prefix" {...form.register('invoice_prefix')} />
              </Field>
              <Field label="Next sequence" htmlFor="settings-seq" error={form.formState.errors.next_invoice_seq?.message}>
                <Input
                  id="settings-seq"
                  type="number"
                  min="1"
                  step="1"
                  {...form.register('next_invoice_seq', { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Format"
                htmlFor="settings-format"
                error={form.formState.errors.invoice_format?.message}
                hint="Available tokens: {prefix}, {year}, {seq}"
                className="sm:col-span-2"
              >
                <Input id="settings-format" placeholder="{prefix}-{year}-{seq}" {...form.register('invoice_format')} />
              </Field>
              <div className="rounded-xl bg-ink-50 px-4 py-3 sm:col-span-2 dark:bg-ink-800/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                  Next invoice number preview
                </p>
                <p className="mt-1 text-lg font-bold tracking-tight text-ink-950 dark:text-white">
                  {previewNumber}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex justify-end pb-8">
            <Button type="submit" leadingIcon={<Save className="h-4 w-4" />} loading={updateSettings.isPending}>
              Save settings
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Logo"
              description="PNG, JPG or WebP up to 2 MB. Private to your account."
              action={<ImagePlus className="h-4 w-4 text-ink-400" />}
            />
            <div className="space-y-3 p-5 pt-4">
              <div className="flex min-h-[112px] items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4 dark:border-ink-700 dark:bg-ink-800/40">
                {logo.isLoading && settings.logo_path ? (
                  <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
                ) : logo.data ? (
                  <img src={logo.data} alt="Current logo" className="max-h-24 max-w-full object-contain" />
                ) : (
                  <p className="text-xs text-ink-400 dark:text-ink-500">No logo uploaded</p>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void handleLogoChange(event.target.files?.[0])}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Upload className="h-4 w-4" />}
                  loading={uploadLogo.isPending}
                  onClick={() => logoInputRef.current?.click()}
                >
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Trash2 className="h-4 w-4" />}
                  disabled={!settings.logo_path || removeLogo.isPending}
                  onClick={() => setLogoConfirmOpen(true)}
                >
                  Remove
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
                Existing invoices keep the logo they were saved with. New and edited invoices use the current logo.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Data & backups"
              description="Export a JSON copy of everything, or move data into a fresh project."
              action={<DatabaseBackup className="h-4 w-4 text-ink-400" />}
            />
            <div className="space-y-4 p-5 pt-4">
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  leadingIcon={<Download className="h-4 w-4" />}
                  loading={exporting}
                  onClick={() => void handleExport()}
                >
                  Export backup
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
                  Includes settings, customers, invoices, line items and payments. The logo file itself is not included.
                </p>
              </div>

              <div className="border-t border-ink-100 pt-4 dark:border-ink-800">
                <input
                  ref={backupInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => void handleBackupFile(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  leadingIcon={<FileJson className="h-4 w-4" />}
                  onClick={() => backupInputRef.current?.click()}
                >
                  Restore from backup
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
                  Restore merges records into this workspace. Existing rows are not overwritten. Best used to recover into a fresh project.
                </p>
              </div>

              <div className="border-t border-ink-100 pt-4 dark:border-ink-800">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  className="w-full"
                  leadingIcon={<Sparkles className="h-4 w-4" />}
                  disabled={sampleDisabled || loadSampleData.isPending}
                  onClick={() => setSampleConfirmOpen(true)}
                >
                  Load sample data
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
                  {sampleDisabled
                    ? 'Available only while there are no invoices in the workspace.'
                    : 'Adds the sample EVO-2026-113 invoice with one payment so you can explore the app.'}
                </p>
              </div>

              {settingsQuery.data ? (
                <p className="border-t border-ink-100 pt-3 text-[11px] text-ink-400 dark:border-ink-800 dark:text-ink-500">
                  Last updated {formatDateTime(settingsQuery.data.updated_at)}
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Owner-only workspace
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-700/80 dark:text-amber-200/75">
                Sign-ups should be disabled in Supabase. Create additional owner accounts from the Supabase dashboard, never from a public sign-up form.
              </p>
            </div>
          </Card>
        </div>
      </form>

      <ConfirmDialog
        open={logoConfirmOpen}
        onClose={() => setLogoConfirmOpen(false)}
        onConfirm={() => void handleRemoveLogo()}
        title="Remove the logo?"
        description="The logo will stop appearing on new and edited invoices. Existing saved invoices keep their current logo."
        confirmLabel="Remove logo"
        destructive
        loading={removeLogo.isPending}
      />

      <ConfirmDialog
        open={sampleConfirmOpen}
        onClose={() => setSampleConfirmOpen(false)}
        onConfirm={() => void handleSampleData()}
        title="Load the sample invoice?"
        description="This adds a customer and one final invoice, EVO-2026-113, with a 10,000 payment. It is only available while no invoices exist."
        confirmLabel="Load sample data"
        loading={loadSampleData.isPending}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => void handleRestore()}
        title="Restore this backup?"
        description={
          restoreName
            ? `${restoreName} will be merged into this workspace. Existing records are kept; matching IDs are skipped.`
            : undefined
        }
        confirmLabel="Restore backup"
        loading={restoring}
      />

      <span className="sr-only">{currency}</span>
    </div>
  )
}
