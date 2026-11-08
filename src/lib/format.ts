import { addDays, addMonths, format, parseISO } from 'date-fns'

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const quantityFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 35000 -> "35,000.00" */
export function formatAmount(value: number | string | null | undefined): string {
  return moneyFormatter.format(toNumber(value))
}

/** 35000 -> "LKR 35,000.00"; negative -> "-LKR 1,000.00" */
export function formatMoney(
  value: number | string | null | undefined,
  currency = 'LKR',
): string {
  const amount = toNumber(value)
  const prefix = amount < 0 ? '-' : ''
  return `${prefix}${currency || 'LKR'} ${moneyFormatter.format(Math.abs(amount))}`
}

/** 1 -> "1", 1.5 -> "1.5" */
export function formatQuantity(value: number | string | null | undefined): string {
  return quantityFormatter.format(toNumber(value))
}

/** Date-only strings (YYYY-MM-DD) are formatted without timezone shifts. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = value.length === 10 ? parseDateOnly(value) : parseISO(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd/MM/yyyy')
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return '—'
  const date = value.length === 10 ? parseDateOnly(value) : parseISO(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd MMM yyyy')
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd MMM yyyy, h:mm a')
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function addDaysISO(value: string, days: number): string {
  return format(addDays(value.length === 10 ? parseDateOnly(value) : parseISO(value), days), 'yyyy-MM-dd')
}

export function addMonthsISO(value: string, months: number): string {
  return format(
    addMonths(value.length === 10 ? parseDateOnly(value) : parseISO(value), months),
    'yyyy-MM-dd',
  )
}

export function monthLabel(value: string): string {
  const date = value.length === 10 ? parseDateOnly(value) : parseISO(value)
  return format(date, 'MMM yyyy')
}

/** Used for file names and download attributes. */
export function sanitizeFilename(value: string, fallback = 'invoice'): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || fallback
}

/**
 * Turns common Sri Lankan formats into an international WhatsApp number.
 * 0771234567 -> 94771234567, +94 77 123 4567 -> 94771234567.
 */
export function normalizePhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`
  else if (digits.length === 9 && digits.startsWith('7')) digits = `94${digits}`
  return digits
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
