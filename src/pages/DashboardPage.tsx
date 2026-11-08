import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback'
import { StatCard } from '@/components/ui/Data'
import { useDashboard } from '@/hooks/useDashboard'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { getErrorMessage } from '@/lib/errors'
import { formatAmount, formatDate, formatMoney, monthLabel } from '@/lib/format'
import type { InvoiceSummary } from '@/types/models'

function InvoiceRow({ invoice, currency }: { invoice: InvoiceSummary; currency: string }) {
  return (
    <Link
      to={`/invoices/${invoice.id}`}
      className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">
            {invoice.invoice_number}
          </span>
          <StatusBadge status={invoice.payment_status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
          {invoice.customer_name || 'No customer'} · {formatDate(invoice.invoice_date)}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-semibold text-ink-900 dark:text-white">
            {formatMoney(invoice.total, currency)}
          </p>
          {invoice.balance > 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {formatMoney(invoice.balance, currency)} due
            </p>
          ) : (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Settled</p>
          )}
        </div>
        <ArrowUpRight className="h-4 w-4 text-ink-300 dark:text-ink-600" />
      </div>
    </Link>
  )
}

function FocusList({
  invoices,
  currency,
  emptyTitle,
  emptyDescription,
  tone,
}: {
  invoices: InvoiceSummary[]
  currency: string
  emptyTitle: string
  emptyDescription: string
  tone: 'rose' | 'sky'
}) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        compact
        icon={tone === 'rose' ? <AlertTriangle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
      />
    )
  }

  return (
    <div className="space-y-1">
      {invoices.map((invoice) => (
        <Link
          key={invoice.id}
          to={`/invoices/${invoice.id}`}
          className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
              {invoice.customer_name || invoice.invoice_number}
            </p>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              {invoice.invoice_number} · due {formatDate(invoice.due_date)}
            </p>
          </div>
          <span
            className={
              tone === 'rose'
                ? 'flex-none text-sm font-semibold text-rose-600 dark:text-rose-400'
                : 'flex-none text-sm font-semibold text-sky-600 dark:text-sky-400'
            }
          >
            {formatMoney(invoice.balance, currency)}
          </span>
        </Link>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { metrics, revenue, recent, overdue, upcoming } = useDashboard()
  const settings = useSettings()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const currency = settings.data?.currency ?? 'LKR'
  const billedColor = theme === 'dark' ? '#e2e8f0' : '#0f172a'
  const gridColor = theme === 'dark' ? '#1e293b' : '#e8ebf0'
  const axisColor = theme === 'dark' ? '#64748b' : '#94a3b8'

  const data = metrics.data ?? {
    billed_this_month: 0,
    received_this_month: 0,
    total_outstanding: 0,
    overdue_count: 0,
  }

  const hasAnyInvoices = (recent.data?.length ?? 0) > 0 || data.billed_this_month > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={new Intl.DateTimeFormat('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date())}
        actions={
          <>
            <Button variant="secondary" size="md" onClick={() => navigate('/customers')}>
              Customers
            </Button>
            <Button size="md" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/invoices/new')}>
              New invoice
            </Button>
          </>
        }
      />

      {metrics.isError ? (
        <ErrorState
          title="Dashboard could not load"
          description={getErrorMessage(metrics.error)}
          action={<Button variant="secondary" onClick={() => void metrics.refetch()}>Try again</Button>}
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[106px] rounded-2xl" />)
            ) : (
              <>
                <StatCard
                  label="Billed this month"
                  value={formatMoney(data.billed_this_month, currency)}
                  icon={<ReceiptText className="h-4 w-4" />}
                  tone="violet"
                  hint="Final invoices dated this month"
                />
                <StatCard
                  label="Received this month"
                  value={formatMoney(data.received_this_month, currency)}
                  icon={<Wallet className="h-4 w-4" />}
                  tone="emerald"
                  hint="Payments recorded this month"
                />
                <StatCard
                  label="Total outstanding"
                  value={formatMoney(data.total_outstanding, currency)}
                  icon={<CircleDollarSign className="h-4 w-4" />}
                  tone="amber"
                  hint="Across all final invoices"
                />
                <StatCard
                  label="Overdue invoices"
                  value={String(data.overdue_count)}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  tone="rose"
                  hint="Past the due date, still unpaid"
                />
              </>
            )}
          </section>

          {!metrics.isLoading && !hasAnyInvoices ? (
            <EmptyState
              title="No invoices yet"
              description="Create your first invoice, or load the sample invoice from Settings to see how everything works."
              icon={<ReceiptText className="h-5 w-5" />}
              action={
                <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/invoices/new')}>
                  Create an invoice
                </Button>
              }
            />
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
            <Card>
              <CardHeader
                title="Revenue"
                description="Billed and received over the last 12 months"
                action={
                  <div className="flex items-center gap-3 text-[11px] font-medium text-ink-500 dark:text-ink-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: billedColor }} /> Billed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Received
                    </span>
                  </div>
                }
              />
              <div className="h-[280px] px-2 pb-4 pt-4">
                {revenue.isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenue.data ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="billedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={billedColor} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={billedColor} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="receivedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.24} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={monthLabel}
                        tick={{ fontSize: 11, fill: axisColor }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={16}
                      />
                      <YAxis
                        tickFormatter={(value: number) => formatAmount(value)}
                        tick={{ fontSize: 11, fill: axisColor }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ stroke: gridColor }}
                        contentStyle={{
                          borderRadius: 12,
                          border: `1px solid ${gridColor}`,
                          background: theme === 'dark' ? '#0f172a' : '#ffffff',
                          color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
                          fontSize: 12,
                          boxShadow: '0 10px 30px -12px rgba(15,23,42,.3)',
                        }}
                        labelFormatter={(label: string) => monthLabel(label)}
                        formatter={(value, name) => [
                          formatMoney(Number(value), currency),
                          name === 'billed' ? 'Billed' : 'Received',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="billed"
                        stroke={billedColor}
                        strokeWidth={2}
                        fill="url(#billedFill)"
                      />
                      <Area
                        type="monotone"
                        dataKey="received"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#receivedFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="flex flex-col">
              <CardHeader
                title="Recent invoices"
                description="The latest records you created"
                action={
                  <Link
                    to="/invoices"
                    className="text-xs font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
                  >
                    View all
                  </Link>
                }
              />
              <div className="flex-1 px-3 py-3">
                {recent.isLoading ? (
                  <div className="space-y-3 px-2 py-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (recent.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="Nothing here yet"
                    description="Your newest invoices will appear here."
                    icon={<ReceiptText className="h-5 w-5" />}
                  />
                ) : (
                  <div className="divide-y divide-ink-100 dark:divide-ink-800/70">
                    {recent.data?.map((invoice) => (
                      <InvoiceRow key={invoice.id} invoice={invoice} currency={currency} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Overdue"
                description="Follow these up first"
                action={<Clock3 className="h-4 w-4 text-rose-500" />}
              />
              <div className="px-3 pb-4 pt-2">
                {overdue.isLoading ? (
                  <div className="space-y-2 px-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <FocusList
                    invoices={overdue.data ?? []}
                    currency={currency}
                    tone="rose"
                    emptyTitle="No overdue invoices"
                    emptyDescription="Every invoice is either paid or still within its due date."
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Due soon"
                description="Due in the next 7 days"
                action={<CalendarClock className="h-4 w-4 text-sky-500" />}
              />
              <div className="px-3 pb-4 pt-2">
                {upcoming.isLoading ? (
                  <div className="space-y-2 px-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <FocusList
                    invoices={upcoming.data ?? []}
                    currency={currency}
                    tone="sky"
                    emptyTitle="Nothing due this week"
                    emptyDescription="Newly issued invoices with a near due date will appear here."
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
