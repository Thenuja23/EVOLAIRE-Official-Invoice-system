import type { PostgrestError } from '@supabase/supabase-js'

type ErrorLike = {
  message?: string
  details?: string
  hint?: string
  code?: string
  error_description?: string
}

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as ErrorLike
    return value.message || value.error_description || ''
  }
  return ''
}

const constraintMessages: Record<string, string> = {
  invoices_user_id_invoice_number_key:
    'Invoice number already exists. Please choose a different number.',
  invoice_items_position_key: 'An invoice can only have 14 line items.',
  invoice_items_unit_check: 'Each line item must have a quantity greater than zero.',
  invoice_items_price_check: 'Line item prices cannot be negative.',
  payments_amount_check: 'The payment amount must be greater than zero.',
  payments_method_check: 'Choose a valid payment method.',
  invoices_due_date_check: 'The due date cannot be before the invoice date.',
  invoices_status_check: 'Choose either Draft or Final for the invoice status.',
  invoices_discount_amount_check: 'The discount cannot be negative.',
  invoices_tax_rate_check: 'The tax rate must be between 0 and 100.',
  settings_advance_percent_check: 'The advance percentage must be between 0 and 100.',
  settings_default_due_days_check: 'The default due days cannot be negative.',
  customers_name_check: 'A customer name is required.',
  settings_business_name_check: 'A business name is required.',
  settings_currency_check: 'Enter a valid currency code.',
  settings_invoice_format_check: 'The invoice number format cannot be empty.',
}

function findConstraint(message: string): string | undefined {
  return Object.keys(constraintMessages).find((name) => message.includes(name))
}

/** Produces a short, human-readable message for UI toasts. */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.'

  const postgrest = error as PostgrestError
  const message = rawMessage(error).trim()
  const lower = message.toLowerCase()

  if (postgrest.code === '23505' || lower.includes('duplicate key')) {
    const constraint = findConstraint(message)
    return constraint
      ? constraintMessages[constraint]
      : 'That record already exists. Please use a different value.'
  }

  if (postgrest.code === '23514' || lower.includes('violates check constraint')) {
    const constraint = findConstraint(message)
    if (constraint) return constraintMessages[constraint]
    if (lower.includes('due date')) return 'The due date cannot be before the invoice date.'
    if (lower.includes('payment')) return message
    return message || 'Some of the values entered are not valid.'
  }

  if (postgrest.code === '23503' || lower.includes('foreign key')) {
    return 'That record is linked to other data and cannot be changed right now.'
  }

  if (postgrest.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'You do not have permission to do that.'
  }

  if (postgrest.code === 'PGRST116') {
    return 'The requested record could not be found.'
  }

  if (postgrest.code === 'PGRST301' || postgrest.code === 'PGRST302') {
    return 'Your session has expired. Please sign in again.'
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed')
  ) {
    return 'Could not reach the server. Check your internet connection and try again.'
  }

  if (lower.includes('invalid login credentials')) return 'Incorrect email or password.'
  if (lower.includes('email not confirmed')) return 'Please confirm your email address before signing in.'
  if (lower.includes('user already registered')) return 'An account with that email already exists.'
  if (lower.includes('password should be at least')) return 'The password is too short.'
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  if (lower.includes('jwt expired')) return 'Your session has expired. Please sign in again.'

  // Supabase often prefixes custom trigger messages with useful text. Return it.
  if (message && !message.startsWith('{')) return message

  return 'Something went wrong. Please try again.'
}

export function isAuthError(error: unknown): boolean {
  const code = (error as PostgrestError)?.code
  return code === 'PGRST301' || code === 'PGRST302' || rawMessage(error).toLowerCase().includes('jwt')
}
