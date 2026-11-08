import type { ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentStatus } from '@/types/models'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-ink-200/70 dark:bg-ink-800',
        className,
      )}
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-700 dark:border-ink-700 dark:border-t-ink-200',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center',
        'dark:border-ink-800 dark:bg-ink-900/40',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-900 dark:text-white">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
      <AlertCircle className="h-8 w-8 text-rose-500" />
      <div>
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{title}</p>
        {description ? (
          <p className="mt-1 max-w-md text-sm text-rose-600 dark:text-rose-300/80">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

const statusStyles: Record<PaymentStatus | string, string> = {
  Draft:
    'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700',
  Unpaid:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  'Partially Paid':
    'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  Paid:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  Overdue:
    'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
}

const dotStyles: Record<string, string> = {
  Draft: 'bg-ink-400',
  Unpaid: 'bg-amber-500',
  'Partially Paid': 'bg-sky-500',
  Paid: 'bg-emerald-500',
  Overdue: 'bg-rose-500',
}

export function StatusBadge({ status }: { status: PaymentStatus | string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        statusStyles[status] ?? statusStyles.Draft,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[status] ?? dotStyles.Draft)} />
      {status}
    </span>
  )
}
