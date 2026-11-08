import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section'
}) {
  return (
    <Component
      className={cn(
        'rounded-2xl border border-ink-100 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900',
        className,
      )}
    >
      {children}
    </Component>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="break-words text-sm font-bold text-ink-950 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-0.5 break-words text-xs text-ink-500 dark:text-ink-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumb?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
        <h1 className="break-words text-2xl font-bold tracking-tight text-ink-950 dark:text-white">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 break-words text-sm text-ink-500 dark:text-ink-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
