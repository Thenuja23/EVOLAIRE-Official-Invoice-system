import type { PaymentMethod, PaymentStatus } from '@/types/models'

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'bank transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'Draft',
  'Unpaid',
  'Partially Paid',
  'Paid',
  'Overdue',
]

export const INVOICE_PAGE_SIZE = 20

export const INVOICE_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
] as const

export const CURRENCY_SUGGESTIONS = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR', 'AED', 'SGD']
