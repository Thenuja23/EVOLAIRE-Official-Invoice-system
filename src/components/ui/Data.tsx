import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'
}

const tones: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
}

export function StatCard({ label, value, hint, icon, tone = 'default' }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {label}
          </p>
          <p className="mt-1.5 break-words text-xl font-bold leading-tight tracking-tight text-ink-950 dark:text-white sm:text-2xl">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-ink-400 dark:text-ink-500">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-xl', tones[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

function pageNumbers(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: Array<number | '…'> = [1]
  if (current > 4) pages.push('…')
  const start = Math.max(2, current - 1)
  const end = Math.min(totalPages - 1, current + 1)
  for (let i = start; i <= end; i += 1) pages.push(i)
  if (current < totalPages - 3) pages.push('…')
  pages.push(totalPages)
  return pages
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-1 pt-4 sm:flex-row dark:border-ink-800">
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Showing <span className="font-semibold text-ink-700 dark:text-ink-200">{first}</span>–
        <span className="font-semibold text-ink-700 dark:text-ink-200">{last}</span> of{' '}
        <span className="font-semibold text-ink-700 dark:text-ink-200">{total}</span>
      </p>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-semibold text-ink-500 dark:text-ink-400 sm:hidden">
          Page {page} of {totalPages}
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers(page, totalPages).map((value, index) =>
            value === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-ink-400">
                …
              </span>
            ) : (
              <button
                key={value}
                type="button"
                onClick={() => onPageChange(value)}
                className={cn(
                  'h-9 min-w-9 rounded-lg px-2 text-xs font-semibold transition-colors',
                  value === page
                    ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
                    : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                {value}
              </button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
