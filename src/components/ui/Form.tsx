import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const controlBase =
  'w-full min-w-0 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-base text-ink-900 shadow-sm outline-none transition sm:text-sm ' +
  'placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-200 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400 ' +
  'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-500 ' +
  'dark:focus:border-ink-500 dark:focus:ring-ink-800 dark:disabled:bg-ink-900/60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return <input ref={ref} type={type} className={cn(controlBase, 'h-10 py-2', className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(controlBase, 'min-h-[80px] resize-y', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(controlBase, 'h-10 py-2 pr-8', className)} {...props}>
        {children}
      </select>
    )
  },
)

interface FieldProps {
  label?: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"
        >
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400 dark:text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  id?: string
}

export function Toggle({ checked, onChange, label, description, disabled, id }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      {label || description ? (
        <div className="min-w-0">
          {label ? (
            <label
              htmlFor={id}
              className="block text-sm font-medium text-ink-800 dark:text-ink-100"
            >
              {label}
            </label>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{description}</p>
          ) : null}
        </div>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'Toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
          "before:absolute before:-inset-2 before:content-['']",
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-950',
          checked ? 'bg-ink-950 dark:bg-emerald-500' : 'bg-ink-200 dark:bg-ink-700',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
