import { z } from 'zod'

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} is too short`)
    .max(max, `${label} is too long`)

const optionalEmail = z
  .string()
  .trim()
  .max(160, 'Email is too long')
  .refine((value) => value === '' || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address',
  })

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long`)

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const customerSchema = z.object({
  name: trimmed(1, 150, 'Customer name'),
  phone: optionalText(40, 'Phone'),
  email: optionalEmail,
  address: optionalText(600, 'Address'),
  notes: optionalText(2000, 'Notes'),
})
export type CustomerValues = z.infer<typeof customerSchema>

export const paymentSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .positive('The amount must be greater than zero')
    .max(999_999_999, 'The amount is too large'),
  paid_on: z.string().min(1, 'Payment date is required'),
  method: z.enum(['cash', 'bank transfer', 'card', 'other']),
  note: optionalText(500, 'Note'),
})
export type PaymentValues = z.infer<typeof paymentSchema>

export const settingsSchema = z.object({
  business_name: trimmed(1, 150, 'Business name'),
  email: optionalEmail,
  phone: optionalText(40, 'Phone'),
  address: optionalText(600, 'Address'),
  bank_account_name: optionalText(150, 'Account holder'),
  bank_account_number: optionalText(80, 'Account number'),
  bank_name: optionalText(150, 'Bank name'),
  bank_branch: optionalText(150, 'Bank branch'),
  default_payment_terms: trimmed(1, 4000, 'Payment terms'),
  currency: z
    .string()
    .trim()
    .min(1, 'Currency is required')
    .max(8, 'Use a short currency code, e.g. LKR')
    .transform((value) => value.toUpperCase()),
  invoice_prefix: z
    .string()
    .trim()
    .min(1, 'Invoice prefix is required')
    .max(20, 'Prefix is too long')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes or underscores only'),
  invoice_format: z
    .string()
    .trim()
    .min(1, 'Invoice format is required')
    .max(80, 'Format is too long')
    .refine((value) => value.includes('{seq}'), 'The format must include {seq}'),
  next_invoice_seq: z
    .number({ invalid_type_error: 'Enter a number' })
    .int('Use a whole number')
    .min(1, 'Must be at least 1')
    .max(999_999_999, 'That number is too large'),
  default_due_days: z
    .number({ invalid_type_error: 'Enter a number' })
    .int('Use a whole number')
    .min(0, 'Cannot be negative')
    .max(365, 'Use 365 days or fewer'),
  advance_percent: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0, 'Cannot be negative')
    .max(100, 'Cannot exceed 100%'),
  tax_enabled: z.boolean(),
  discount_enabled: z.boolean(),
})
export type SettingsValues = z.infer<typeof settingsSchema>

const lineItemSchema = z.object({
  description: z.string().trim().max(500, 'Description is too long'),
  unit: z
    .number({ invalid_type_error: 'Enter a quantity' })
    .positive('Must be greater than 0')
    .max(99_999_999, 'Quantity is too large'),
  price: z
    .number({ invalid_type_error: 'Enter a price' })
    .min(0, 'Cannot be negative')
    .max(999_999_999, 'Price is too large'),
})

export const invoiceBusinessSchema = z.object({
  business_name: trimmed(1, 150, 'Business name'),
  email: optionalText(160, 'Email'),
  phone: optionalText(40, 'Phone'),
  address: optionalText(600, 'Address'),
  bank_account_name: optionalText(150, 'Account holder'),
  bank_account_number: optionalText(80, 'Account number'),
  bank_name: optionalText(150, 'Bank name'),
  bank_branch: optionalText(150, 'Bank branch'),
  logo_path: z.string().nullable().optional(),
})

export const invoiceFormSchema = z
  .object({
    status: z.enum(['draft', 'final']),
    invoice_number: trimmed(1, 60, 'Invoice number'),
    customer_id: z.string().nullable(),
    customer_name: z.string().trim().max(150, 'Customer name is too long'),
    project_name: optionalText(200, 'Project name'),
    invoice_date: z.string().min(1, 'Invoice date is required'),
    due_date: z.string().min(1, 'Due date is required'),
    notes: optionalText(5000, 'Notes'),
    payment_terms: optionalText(5000, 'Payment terms'),
    discount_amount: z
      .number({ invalid_type_error: 'Enter a valid discount' })
      .min(0, 'Cannot be negative')
      .max(999_999_999, 'Discount is too large'),
    tax_rate: z
      .number({ invalid_type_error: 'Enter a valid tax rate' })
      .min(0, 'Cannot be negative')
      .max(100, 'Cannot exceed 100%'),
    business: invoiceBusinessSchema,
    items: z.array(lineItemSchema).max(14, 'An invoice can have at most 14 line items'),
  })
  .superRefine((values, ctx) => {
    if (values.due_date && values.invoice_date && values.due_date < values.invoice_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['due_date'],
        message: 'Due date cannot be before the invoice date',
      })
    }

    if (values.status === 'final' && values.customer_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customer_name'],
        message: 'Choose a customer before saving a final invoice',
      })
    }

    values.items.forEach((item, index) => {
      if (item.price > 0 && item.description.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'description'],
          message: 'Add a description for this line',
        })
      }
    })
  })

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>
export type InvoiceLineItemValues = z.infer<typeof lineItemSchema>

export const backupFileSchema = z.object({
  format: z.string().optional(),
  version: z.number().optional(),
  exported_at: z.string().optional(),
  tables: z.object({
    settings: z.array(z.unknown()).optional(),
    customers: z.array(z.unknown()).optional(),
    invoices: z.array(z.unknown()).optional(),
    invoice_items: z.array(z.unknown()).optional(),
    payments: z.array(z.unknown()).optional(),
  }),
})
