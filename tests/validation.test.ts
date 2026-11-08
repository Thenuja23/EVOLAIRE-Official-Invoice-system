import { describe, it, expect } from 'vitest'
import {
  backupFileSchema,
  customerSchema,
  invoiceFormSchema,
  loginSchema,
  paymentSchema,
  settingsSchema,
} from '@/lib/validation'

describe('Zod Validation Schemas (Phase 2 & Phase 7)', () => {
  describe('loginSchema', () => {
    it('accepts valid email and password', () => {
      const result = loginSchema.safeParse({
        email: 'owner@evolaire.lk',
        password: 'Password123!',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid email address', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Enter a valid email address')
      }
    })

    it('rejects empty fields', () => {
      expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false)
    })
  })

  describe('customerSchema', () => {
    it('accepts valid customer with complete details', () => {
      const result = customerSchema.safeParse({
        name: 'Maneesha Vithanage',
        phone: '+94 77 123 4567',
        email: 'maneesha@example.com',
        address: '123 Galle Road, Colombo',
        notes: 'VIP Client',
      })
      expect(result.success).toBe(true)
    })

    it('accepts minimal customer with name only', () => {
      const result = customerSchema.safeParse({
        name: 'Maneesha Vithanage',
        phone: '',
        email: '',
        address: '',
        notes: '',
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty or whitespace-only name', () => {
      expect(customerSchema.safeParse({ name: '' }).success).toBe(false)
      expect(customerSchema.safeParse({ name: '   ' }).success).toBe(false)
    })

    it('rejects customer name longer than 150 chars', () => {
      expect(customerSchema.safeParse({ name: 'A'.repeat(151) }).success).toBe(false)
    })

    it('rejects invalid email format when email is provided', () => {
      const result = customerSchema.safeParse({
        name: 'John Doe',
        email: 'invalid-email',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('paymentSchema', () => {
    it('accepts valid payment values', () => {
      const result = paymentSchema.safeParse({
        amount: 15000,
        paid_on: '2026-10-31',
        method: 'bank transfer',
        note: 'Slip #1234',
      })
      expect(result.success).toBe(true)
    })

    it('rejects zero or negative payment amounts', () => {
      expect(paymentSchema.safeParse({ amount: 0, paid_on: '2026-10-31', method: 'cash' }).success).toBe(false)
      expect(paymentSchema.safeParse({ amount: -500, paid_on: '2026-10-31', method: 'cash' }).success).toBe(false)
    })

    it('rejects invalid payment method', () => {
      const result = paymentSchema.safeParse({
        amount: 1000,
        paid_on: '2026-10-31',
        method: 'crypto', // Not in allowed enum
      })
      expect(result.success).toBe(false)
    })
  })

  describe('settingsSchema', () => {
    const validSettings = {
      business_name: 'EVOLAIRE',
      email: 'hello@evolaire.lk',
      phone: '+94 77 123 4567',
      address: 'Colombo, Sri Lanka',
      bank_account_name: 'EVOLAIRE (PVT) LTD',
      bank_account_number: '1234567890',
      bank_name: 'Commercial Bank',
      bank_branch: 'Colombo 03',
      default_payment_terms: 'Payment due within 7 days.',
      currency: 'lkr',
      invoice_prefix: 'EVO',
      invoice_format: '{prefix}-{year}-{seq}',
      next_invoice_seq: 1,
      default_due_days: 7,
      advance_percent: 40,
      tax_enabled: false,
      discount_enabled: false,
    }

    it('accepts valid settings and transforms currency to uppercase', () => {
      const result = settingsSchema.safeParse(validSettings)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currency).toBe('LKR')
      }
    })

    it('rejects invoice format that omits {seq}', () => {
      const result = settingsSchema.safeParse({
        ...validSettings,
        invoice_format: '{prefix}-{year}',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid invoice prefix containing spaces or symbols', () => {
      expect(
        settingsSchema.safeParse({
          ...validSettings,
          invoice_prefix: 'EVO #1',
        }).success,
      ).toBe(false)
    })

    it('rejects negative sequence or due days', () => {
      expect(settingsSchema.safeParse({ ...validSettings, next_invoice_seq: 0 }).success).toBe(false)
      expect(settingsSchema.safeParse({ ...validSettings, default_due_days: -1 }).success).toBe(false)
      expect(settingsSchema.safeParse({ ...validSettings, advance_percent: 105 }).success).toBe(false)
    })
  })

  describe('invoiceFormSchema', () => {
    const validInvoice = {
      status: 'draft' as const,
      invoice_number: 'EVO-2026-001',
      customer_id: null,
      customer_name: '',
      project_name: 'Brand Identity',
      invoice_date: '2026-10-31',
      due_date: '2026-11-07',
      notes: '',
      payment_terms: '40% advance',
      discount_amount: 0,
      tax_rate: 0,
      business: {
        business_name: 'EVOLAIRE',
        email: 'hello@evolaire.lk',
        phone: '',
        address: '',
        bank_account_name: '',
        bank_account_number: '',
        bank_name: '',
        bank_branch: '',
        logo_path: null,
      },
      items: [{ description: 'Logo Design', unit: 1, price: 50000 }],
    }

    it('accepts a valid draft invoice even without a customer selected', () => {
      const result = invoiceFormSchema.safeParse(validInvoice)
      expect(result.success).toBe(true)
    })

    it('rejects final invoice when customer name is empty', () => {
      const result = invoiceFormSchema.safeParse({
        ...validInvoice,
        status: 'final',
        customer_name: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('customer_name'))).toBe(true)
      }
    })

    it('accepts final invoice when customer name is provided', () => {
      const result = invoiceFormSchema.safeParse({
        ...validInvoice,
        status: 'final',
        customer_name: 'Maneesha Vithanage',
      })
      expect(result.success).toBe(true)
    })

    it('rejects due date before invoice date', () => {
      const result = invoiceFormSchema.safeParse({
        ...validInvoice,
        invoice_date: '2026-11-05',
        due_date: '2026-11-01',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('due_date'))).toBe(true)
      }
    })

    it('rejects line item with price > 0 and empty description', () => {
      const result = invoiceFormSchema.safeParse({
        ...validInvoice,
        items: [{ description: '', unit: 1, price: 1000 }],
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('description'))).toBe(true)
      }
    })

    it('enforces maximum 14 line items limit', () => {
      const items14 = Array.from({ length: 14 }, (_, i) => ({
        description: `Item ${i + 1}`,
        unit: 1,
        price: 1000,
      }))
      expect(invoiceFormSchema.safeParse({ ...validInvoice, items: items14 }).success).toBe(true)

      const items15 = Array.from({ length: 15 }, (_, i) => ({
        description: `Item ${i + 1}`,
        unit: 1,
        price: 1000,
      }))
      expect(invoiceFormSchema.safeParse({ ...validInvoice, items: items15 }).success).toBe(false)
    })
  })

  describe('backupFileSchema', () => {
    it('validates a well-formed EVOLAIRE backup file', () => {
      const validBackup = {
        format: 'evolaire-backup',
        version: 1,
        exported_at: '2026-10-31T12:00:00Z',
        tables: {
          settings: [],
          customers: [],
          invoices: [],
          invoice_items: [],
          payments: [],
        },
      }
      expect(backupFileSchema.safeParse(validBackup).success).toBe(true)
    })

    it('rejects a malformed backup where tables is not an object', () => {
      expect(backupFileSchema.safeParse({ tables: 'invalid' }).success).toBe(false)
    })
  })
})
