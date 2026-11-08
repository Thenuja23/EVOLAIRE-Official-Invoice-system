import { describe, it, expect } from 'vitest'
import {
  buildDocumentFromForm,
  buildDocumentFromInvoice,
  PRINT_PAGE_STYLE,
} from '@/lib/invoiceDocument'
import { normalizeSnapshot, businessSnapshotFromSettings } from '@/lib/invoice'
import type { InvoiceItem, InvoiceSummary, Settings } from '@/types/models'
import type { InvoiceFormValues } from '@/lib/validation'

describe('Invoice Document & Print Generation (Phase 4)', () => {
  const baseSettings: Settings = {
    id: 'settings-1',
    user_id: 'user-1',
    business_name: 'EVOLAIRE',
    logo_path: null,
    email: 'hello@evolaire.lk',
    phone: '+94 77 123 4567',
    address: 'Colombo, Sri Lanka',
    bank_account_name: 'EVOLAIRE (PVT) LTD',
    bank_account_number: '1234567890',
    bank_name: 'Commercial Bank',
    bank_branch: 'Colombo 03',
    default_payment_terms: '40% advance required.',
    currency: 'LKR',
    invoice_prefix: 'EVO',
    invoice_format: '{prefix}-{year}-{seq}',
    next_invoice_seq: 114,
    default_due_days: 7,
    advance_percent: 40,
    tax_enabled: true,
    discount_enabled: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }

  const baseInvoice: InvoiceSummary = {
    id: 'inv-1',
    user_id: 'user-1',
    invoice_number: 'EVO-2026-113',
    customer_id: 'cust-1',
    customer_name: 'Maneesha Vithanage',
    project_name: 'Soul of seafood',
    invoice_date: '2026-10-31',
    due_date: '2026-11-07',
    status: 'final',
    notes: 'Thank you for your business',
    payment_terms: '40% advance required.',
    business_snapshot: {
      business_name: 'EVOLAIRE',
      email: 'hello@evolaire.lk',
      phone: '+94 77 123 4567',
      address: 'Colombo, Sri Lanka',
      bank_account_name: 'EVOLAIRE (PVT) LTD',
      bank_account_number: '1234567890',
      bank_name: 'Commercial Bank',
      bank_branch: 'Colombo 03',
      logo_path: null,
    },
    discount_amount: 5000,
    tax_rate: 10,
    subtotal: 35000,
    total: 33000, // (35000 - 5000) = 30000 + 10% = 33000
    deleted_at: null,
    created_at: '2026-10-31T10:00:00Z',
    updated_at: '2026-10-31T10:00:00Z',
    paid: 10000,
    balance: 23000,
    payment_status: 'Partially Paid',
  }

  const baseItems: InvoiceItem[] = [
    {
      id: 'item-1',
      user_id: 'user-1',
      invoice_id: 'inv-1',
      position: 1,
      description: 'Social Media Handling - Monthly',
      unit: 1,
      price: 35000,
      line_total: 35000,
      created_at: '2026-10-31T10:00:00Z',
      updated_at: '2026-10-31T10:00:00Z',
    },
  ]

  it('builds authoritative document data from saved invoice record', () => {
    const doc = buildDocumentFromInvoice({
      invoice: baseInvoice,
      items: baseItems,
      settings: baseSettings,
      logoUrl: 'https://example.com/logo.png',
    })

    expect(doc.invoiceNumber).toBe('EVO-2026-113')
    expect(doc.customerName).toBe('Maneesha Vithanage')
    expect(doc.projectName).toBe('Soul of seafood')
    expect(doc.subtotal).toBe(35000)
    expect(doc.discountAmount).toBe(5000)
    expect(doc.showDiscount).toBe(true)
    expect(doc.taxRate).toBe(10)
    expect(doc.taxAmount).toBe(3000) // (35000 - 5000) * 10%
    expect(doc.showTax).toBe(true)
    expect(doc.total).toBe(33000)
    expect(doc.currency).toBe('LKR')
    expect(doc.logoUrl).toBe('https://example.com/logo.png')
    expect(doc.items).toHaveLength(1)
    expect(doc.items[0].description).toBe('Social Media Handling - Monthly')
  })

  it('hides discount and tax rows when they are zero', () => {
    const zeroDiscountTaxInvoice: InvoiceSummary = {
      ...baseInvoice,
      discount_amount: 0,
      tax_rate: 0,
      subtotal: 35000,
      total: 35000,
    }

    const doc = buildDocumentFromInvoice({
      invoice: zeroDiscountTaxInvoice,
      items: baseItems,
      settings: baseSettings,
      logoUrl: null,
    })

    expect(doc.showDiscount).toBe(false)
    expect(doc.showTax).toBe(false)
    expect(doc.discountAmount).toBe(0)
    expect(doc.taxAmount).toBe(0)
    expect(doc.total).toBe(35000)
  })

  it('builds document data from active form values with live calculations', () => {
    const formValues: InvoiceFormValues = {
      status: 'draft',
      invoice_number: 'EVO-2026-114',
      customer_id: 'cust-1',
      customer_name: 'Test Customer',
      project_name: 'Test Project',
      invoice_date: '2026-11-01',
      due_date: '2026-11-08',
      notes: 'Form note',
      payment_terms: 'Full payment on delivery',
      discount_amount: 1000,
      tax_rate: 5,
      business: {
        business_name: 'EVOLAIRE',
        email: 'hello@evolaire.lk',
        phone: '',
        address: '',
        bank_account_name: 'EVOLAIRE',
        bank_account_number: '123',
        bank_name: 'BOC',
        bank_branch: 'Main',
        logo_path: null,
      },
      items: [
        { description: 'Service A', unit: 2, price: 10000 }, // 20000
        { description: 'Service B', unit: 1, price: 5000 },  // 5000 -> subtotal 25000
      ],
    }

    const doc = buildDocumentFromForm({
      values: formValues,
      settings: baseSettings,
      logoUrl: null,
    })

    expect(doc.subtotal).toBe(25000)
    expect(doc.discountAmount).toBe(1000)
    expect(doc.showDiscount).toBe(true)
    expect(doc.taxAmount).toBe(1200) // (25000 - 1000) * 5% = 1200
    expect(doc.showTax).toBe(true)
    expect(doc.total).toBe(25200) // 24000 + 1200
  })

  it('normalizes snapshots safely with missing, empty, or null fields', () => {
    const emptySnap = normalizeSnapshot(null)
    expect(emptySnap.business_name).toBe('EVOLAIRE')
    expect(emptySnap.email).toBe('')
    expect(emptySnap.logo_path).toBe(null)

    const partialSnap = normalizeSnapshot({
      business_name: 'Custom Brand',
      phone: '0771112233',
    })
    expect(partialSnap.business_name).toBe('Custom Brand')
    expect(partialSnap.phone).toBe('0771112233')
    expect(partialSnap.bank_account_name).toBe('')
  })

  it('creates business snapshot from settings correctly', () => {
    const snap = businessSnapshotFromSettings(baseSettings)
    expect(snap.business_name).toBe('EVOLAIRE')
    expect(snap.email).toBe('hello@evolaire.lk')
    expect(snap.bank_name).toBe('Commercial Bank')
  })

  it('defines valid print styles for A4 without margin', () => {
    expect(PRINT_PAGE_STYLE).toContain('@page { size: A4; margin: 0; }')
    expect(PRINT_PAGE_STYLE).toContain('print-color-adjust: exact')
  })
})
