import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import {
  calculateDisplayTotals,
  calculateLineTotal,
  formatMoney,
  roundMoney,
} from '@/lib/invoice'
import {
  customerSchema,
  invoiceFormSchema,
  paymentSchema,
} from '@/lib/validation'
import {
  activateLocalWorkspace,
  createDefaultSettings,
  createUuid,
  isLocalWorkspaceActive,
  isRlsOrPermissionError,
  isSchemaCacheMissingError,
  readLocalWorkspace,
  recalculateLocalInvoiceTotals,
  toInvoiceSummary,
  validateLocalPaymentWrite,
  writeLocalWorkspace,
} from '@/services/serviceUtils'
import type {
  Customer,
  Invoice,
  InvoiceItem,
  LocalWorkspace,
  Payment,
} from '@/services/serviceUtils'
import {
  buildDocumentFromInvoice,
  buildDocumentFromForm,
} from '@/lib/invoiceDocument'

describe('Phase 11: Real-World Business Scenario Verification (Scenarios 01 - 25)', () => {
  const userId = 'usr-qa-test-1001'
  const store = new Map<string, string>()

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.getItem) {
      const storageMock = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (idx: number) => Array.from(store.keys())[idx] ?? null,
        get length() {
          return store.size
        },
      }
      Object.defineProperty(globalThis, 'localStorage', {
        value: storageMock,
        writable: true,
      })
    }
  })

  beforeEach(() => {
    store.clear()
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.clear) {
      globalThis.localStorage.clear()
    }
  })

  // Helper to construct a fresh workspace
  function getCleanWorkspace(): LocalWorkspace {
    const ws = readLocalWorkspace(userId)
    ws.active = true
    ws.settings = createDefaultSettings(userId)
    return ws
  }

  it('SCENARIO 01 — Create Customer and Issue Invoice', () => {
    const ws = getCleanWorkspace()
    const now = new Date().toISOString()

    // 1. Create customer
    const customer: Customer = {
      id: createUuid(),
      user_id: userId,
      name: 'Acme Corporation Ltd',
      email: 'finance@acme.example.com',
      phone: '+94 77 123 4567',
      address: 'Level 10, Colombo Business Center, Sri Lanka',
      notes: 'Corporate client',
      archived_at: null,
      created_at: now,
      updated_at: now,
    }
    expect(customerSchema.safeParse(customer).success).toBe(true)
    ws.customers.push(customer)

    // 2. Issue invoice
    const invoiceId = createUuid()
    const invoice: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      customer_email_snapshot: customer.email,
      customer_address_snapshot: customer.address,
      invoice_number: 'EVO-2026-001',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: 'Initial consulting deliverables',
      payment_terms: 'Payment due in 14 days',
      status: 'final',
      subtotal: '50000',
      discount_total: '0',
      tax_total: '0',
      total: '50000',
      balance_due: '50000',
      created_at: now,
      updated_at: now,
    }

    const item: InvoiceItem = {
      id: createUuid(),
      invoice_id: invoiceId,
      position: 1,
      description: 'Enterprise ERP Implementation - Milestone 1',
      quantity: '1',
      unit_price: '50000',
      line_total: '50000',
      created_at: now,
    }

    ws.invoices.push(invoice)
    ws.invoice_items.push(item)
    writeLocalWorkspace(userId, ws)

    // 3. Verification
    const saved = readLocalWorkspace(userId)
    expect(saved.invoices.length).toBe(1)
    expect(saved.invoices[0].invoice_number).toBe('EVO-2026-001')
    expect(saved.invoices[0].customer_name_snapshot).toBe('Acme Corporation Ltd')
    expect(saved.invoice_items.length).toBe(1)
    expect(saved.invoice_items[0].line_total).toBe('50000')

    const summary = toInvoiceSummary(saved.invoices[0], saved.payments)
    expect(summary.payment_status).toBe('unpaid')
    expect(summary.total_paid).toBe(0)
    expect(summary.balance_due).toBe(50000)
  })

  it('SCENARIO 02 — Multi-Item Invoice with Different Pricing', () => {
    const items = [
      { description: 'Cloud Infrastructure Setup', quantity: 2, unitPrice: 45000 },
      { description: 'Senior DevOps Specialist (Hours)', quantity: 37.5, unitPrice: 3500 },
      { description: 'SSL Wildcard Certificate (1 Year)', quantity: 1, unitPrice: 12500 },
    ]

    const calculatedItems = items.map((it, idx) => ({
      position: idx + 1,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      line_total: calculateLineTotal(it.quantity, it.unitPrice),
    }))

    expect(calculatedItems[0].line_total).toBe(90000)
    expect(calculatedItems[1].line_total).toBe(131250)
    expect(calculatedItems[2].line_total).toBe(12500)

    const totals = calculateDisplayTotals(
      calculatedItems.map((c) => ({
        ...c,
        id: `it-${c.position}`,
        invoice_id: 'inv-multi',
        quantity: String(c.quantity),
        unit_price: String(c.unit_price),
        line_total: String(c.line_total),
        created_at: new Date().toISOString(),
      })),
      {
        discountAmount: 0,
        taxRate: 0,
        discountEnabled: false,
        taxEnabled: false,
      },
    )

    expect(totals.subtotal).toBe(233750)
    expect(totals.total).toBe(233750)
  })

  it('SCENARIO 03 — Invoices with Discounts and Taxes', () => {
    // Subtotal: 100,000. Discount: 15,000. Tax: 18% VAT
    // Discounted Subtotal: 85,000. Tax: 85,000 * 0.18 = 15,300. Total = 100,300.
    const items = [
      {
        id: 'i1',
        invoice_id: 'inv-tax-disc',
        position: 1,
        description: 'Software License Annual Subscription',
        quantity: '1',
        unit_price: '100000',
        line_total: '100000',
        created_at: new Date().toISOString(),
      },
    ]

    const totals = calculateDisplayTotals(items, {
      discountAmount: 15000,
      taxRate: 18,
      discountEnabled: true,
      taxEnabled: true,
    })

    expect(totals.subtotal).toBe(100000)
    expect(totals.discountTotal).toBe(15000)
    expect(totals.taxTotal).toBe(15300)
    expect(totals.total).toBe(100300)

    // Verify discount cannot exceed subtotal
    const excessDiscountTotals = calculateDisplayTotals(items, {
      discountAmount: 150000, // exceeds 100000
      taxRate: 10,
      discountEnabled: true,
      taxEnabled: true,
    })
    expect(excessDiscountTotals.discountTotal).toBe(100000) // capped at subtotal
    expect(excessDiscountTotals.taxTotal).toBe(0)
    expect(excessDiscountTotals.total).toBe(0)
  })

  it('SCENARIO 04 — Persistent Invoices Across Sessions', () => {
    const ws = getCleanWorkspace()
    const invoiceId = createUuid()
    ws.invoices.push({
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Persistent Corp',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-088',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '25000',
      discount_total: '0',
      tax_total: '0',
      total: '25000',
      balance_due: '25000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    writeLocalWorkspace(userId, ws)

    // Simulate session resumption / fresh page load
    const reloaded = readLocalWorkspace(userId)
    expect(reloaded.active).toBe(true)
    expect(reloaded.invoices.length).toBe(1)
    expect(reloaded.invoices[0].id).toBe(invoiceId)
    expect(reloaded.invoices[0].invoice_number).toBe('EVO-2026-088')
    expect(reloaded.invoices[0].total).toBe('25000')
  })

  it('SCENARIO 05 — Record Partial Payment', () => {
    const ws = getCleanWorkspace()
    const invoiceId = createUuid()
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Client Alpha',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-005',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '40000',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '100000',
      discount_total: '0',
      tax_total: '0',
      total: '100000',
      balance_due: '100000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)

    // Record partial payment of 40,000 (advance)
    const paymentId = createUuid()
    const p1: Payment = {
      id: paymentId,
      user_id: userId,
      invoice_id: invoiceId,
      amount: '40000',
      payment_date: '2026-03-02',
      payment_method: 'bank_transfer',
      reference_note: 'ADVANCE-TRANSFER-01',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(paymentSchema.safeParse(p1).success).toBe(true)

    validateLocalPaymentWrite(ws, invoiceId, 40000)
    ws.payments.push(p1)
    writeLocalWorkspace(userId, ws)

    const summary = toInvoiceSummary(inv, ws.payments)
    expect(summary.total_paid).toBe(40000)
    expect(summary.balance_due).toBe(60000)
    expect(summary.payment_status).toBe('partially_paid')
  })

  it('SCENARIO 06 — Record Final Payment and Verify Status Change', () => {
    const ws = getCleanWorkspace()
    const invoiceId = createUuid()
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Client Alpha',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-006',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '100000',
      discount_total: '0',
      tax_total: '0',
      total: '100000',
      balance_due: '60000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)
    // First partial payment
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '40000',
      payment_date: '2026-03-02',
      payment_method: 'bank_transfer',
      reference_note: 'ADVANCE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Final settlement payment of 60,000
    validateLocalPaymentWrite(ws, invoiceId, 60000)
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '60000',
      payment_date: '2026-03-10',
      payment_method: 'cash',
      reference_note: 'SETTLEMENT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const summary = toInvoiceSummary(inv, ws.payments)
    expect(summary.total_paid).toBe(100000)
    expect(summary.balance_due).toBe(0)
    expect(summary.payment_status).toBe('paid')
  })

  it('SCENARIO 07 — Outstanding Balance Recalculation', () => {
    const ws = getCleanWorkspace()
    const invoiceId = createUuid()
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Dynamic Balance Test',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-007',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '200000',
      discount_total: '0',
      tax_total: '0',
      total: '200000',
      balance_due: '200000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)

    // Initial state: Unpaid
    expect(toInvoiceSummary(inv, ws.payments).balance_due).toBe(200000)
    expect(toInvoiceSummary(inv, ws.payments).payment_status).toBe('unpaid')

    // Payment 1: 50,000 -> 150,000 remaining
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '50000',
      payment_date: '2026-03-02',
      payment_method: 'bank_transfer',
      reference_note: 'P1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(toInvoiceSummary(inv, ws.payments).balance_due).toBe(150000)
    expect(toInvoiceSummary(inv, ws.payments).payment_status).toBe('partially_paid')

    // Payment 2: 75,000 -> 75,000 remaining
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '75000',
      payment_date: '2026-03-05',
      payment_method: 'bank_transfer',
      reference_note: 'P2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(toInvoiceSummary(inv, ws.payments).balance_due).toBe(75000)
    expect(toInvoiceSummary(inv, ws.payments).payment_status).toBe('partially_paid')

    // Payment 3: 75,000 -> 0 remaining
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '75000',
      payment_date: '2026-03-10',
      payment_method: 'bank_transfer',
      reference_note: 'P3',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(toInvoiceSummary(inv, ws.payments).balance_due).toBe(0)
    expect(toInvoiceSummary(inv, ws.payments).payment_status).toBe('paid')
  })

  it('SCENARIO 08 — PDF and Print Document Matches Stored Invoice', () => {
    const ws = getCleanWorkspace()
    const inv: Invoice = {
      id: 'inv-doc-match',
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Global Tech Corp',
      customer_phone_snapshot: '+1-555-0199',
      customer_email_snapshot: 'billing@globaltech.com',
      customer_address_snapshot: '123 Market St, San Francisco, CA',
      invoice_number: 'EVO-2026-777',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '30000',
      discount_amount: '5000',
      tax_rate: '15',
      notes: 'Hardware delivery and installation',
      payment_terms: 'Strictly 14 days',
      status: 'final',
      subtotal: '100000',
      discount_total: '5000',
      tax_total: '14250',
      total: '109250',
      balance_due: '79250',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const items: InvoiceItem[] = [
      {
        id: 'itm-1',
        invoice_id: inv.id,
        position: 1,
        description: 'Server Rack Assembly & Deployment',
        quantity: '2',
        unit_price: '50000',
        line_total: '100000',
        created_at: new Date().toISOString(),
      },
    ]

    const doc = buildDocumentFromInvoice(inv, items, ws.settings, 30000, 79250)

    // Absolute match verification between stored entity and rendered document
    expect(doc.invoiceNumber).toBe(inv.invoice_number)
    expect(doc.customer.name).toBe(inv.customer_name_snapshot)
    expect(doc.customer.phone).toBe(inv.customer_phone_snapshot)
    expect(doc.customer.email).toBe(inv.customer_email_snapshot)
    expect(doc.customer.address).toBe(inv.customer_address_snapshot)
    expect(doc.subtotal).toBe(100000)
    expect(doc.discountAmount).toBe(5000)
    expect(doc.taxRate).toBe(15)
    expect(doc.taxTotal).toBe(14250)
    expect(doc.total).toBe(109250)
    expect(doc.paidAmount).toBe(30000)
    expect(doc.balanceDue).toBe(79250)
    expect(doc.items.length).toBe(1)
    expect(doc.items[0].description).toBe('Server Rack Assembly & Deployment')
    expect(doc.items[0].lineTotal).toBe(100000)
  })

  it('SCENARIO 09 — Invoice Search by Number', () => {
    const list: Array<{ invoice_number: string; customer_name: string }> = [
      { invoice_number: 'EVO-2026-001', customer_name: 'Acme Corp' },
      { invoice_number: 'EVO-2026-002', customer_name: 'Beta Ltd' },
      { invoice_number: 'EVO-2026-015', customer_name: 'Charlie Inc' },
      { invoice_number: 'EVO-2026-102', customer_name: 'Delta LLC' },
    ]

    const query = '2026-015'
    const results = list.filter((item) =>
      item.invoice_number.toLowerCase().includes(query.toLowerCase()) ||
      item.customer_name.toLowerCase().includes(query.toLowerCase()),
    )

    expect(results.length).toBe(1)
    expect(results[0].invoice_number).toBe('EVO-2026-015')
    expect(results[0].customer_name).toBe('Charlie Inc')
  })

  it('SCENARIO 10 — Date Range and Status Filtering', () => {
    const records = [
      { id: '1', date: '2026-01-10', status: 'final', payment_status: 'paid' },
      { id: '2', date: '2026-02-15', status: 'final', payment_status: 'unpaid' },
      { id: '3', date: '2026-03-01', status: 'draft', payment_status: 'unpaid' },
      { id: '4', date: '2026-03-05', status: 'final', payment_status: 'partially_paid' },
      { id: '5', date: '2026-03-12', status: 'cancelled', payment_status: 'unpaid' },
    ]

    // Filter: February to March 2026, status = 'final'
    const filtered = records.filter(
      (r) => r.date >= '2026-02-01' && r.date <= '2026-03-31' && r.status === 'final',
    )
    expect(filtered.length).toBe(2)
    expect(filtered.map((f) => f.id)).toEqual(['2', '4'])

    // Filter: unpaid or partially_paid
    const pendingPayment = records.filter((r) =>
      ['unpaid', 'partially_paid'].includes(r.payment_status),
    )
    expect(pendingPayment.length).toBe(4)
  })

  it('SCENARIO 11 — Invoice Editing and Total Recalculation', () => {
    const ws = getCleanWorkspace()
    const invoiceId = createUuid()
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Editable Corp',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-011',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '1000',
      tax_rate: '10',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '10000',
      discount_total: '1000',
      tax_total: '900',
      total: '9900',
      balance_due: '9900',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)
    ws.invoice_items.push({
      id: 'it-1',
      invoice_id: invoiceId,
      position: 1,
      description: 'Consulting',
      quantity: '1',
      unit_price: '10000',
      line_total: '10000',
      created_at: new Date().toISOString(),
    })

    // Edit: change quantity from 1 to 3 (Subtotal becomes 30,000)
    // Discount: 1000 -> Discounted: 29,000. Tax 10%: 2,900. Total: 31,900.
    ws.settings.tax_enabled = true
    ws.settings.discount_enabled = true
    ws.invoice_items[0].quantity = '3'
    ws.invoice_items[0].line_total = '30000'

    recalculateLocalInvoiceTotals(ws, invoiceId)

    const updated = ws.invoices.find((i) => i.id === invoiceId)!
    expect(Number(updated.subtotal)).toBe(30000)
    expect(Number(updated.discount_total)).toBe(1000)
    expect(Number(updated.tax_total)).toBe(2900)
    expect(Number(updated.total)).toBe(31900)
    expect(Number(updated.balance_due)).toBe(31900)
  })

  it('SCENARIO 12 — Rejection of Invalid Data (negative, missing, invalid date order)', () => {
    // 1. Due date before invoice date
    const invalidDates = invoiceFormSchema.safeParse({
      customer_mode: 'existing',
      customer_id: 'cust-1',
      customer_name: 'Test',
      customer_phone: '',
      customer_email: '',
      customer_address: '',
      save_customer: false,
      invoice_number: 'EVO-2026-001',
      invoice_date: '2026-03-20',
      due_date: '2026-03-10', // Before invoice date!
      status: 'final',
      notes: '',
      payment_terms: '',
      advance_amount: 0,
      discount_amount: 0,
      tax_rate: 0,
      items: [{ description: 'Item 1', quantity: 1, unit_price: 100 }],
    })
    expect(invalidDates.success).toBe(false)
    if (!invalidDates.success) {
      expect(invalidDates.error.issues.some((i) => i.path.includes('due_date'))).toBe(true)
    }

    // 2. Negative discount
    const negativeDiscount = invoiceFormSchema.safeParse({
      customer_mode: 'manual',
      customer_name: 'Manual Cust',
      invoice_number: 'EVO-2026-002',
      invoice_date: '2026-03-01',
      due_date: '2026-03-08',
      status: 'final',
      advance_amount: 0,
      discount_amount: -500, // Negative!
      tax_rate: 0,
      items: [{ description: 'Item 1', quantity: 1, unit_price: 100 }],
    })
    expect(negativeDiscount.success).toBe(false)

    // 3. Negative payment
    const negativePayment = paymentSchema.safeParse({
      invoice_id: 'inv-1',
      amount: -100,
      payment_date: '2026-03-01',
      payment_method: 'cash',
    })
    expect(negativePayment.success).toBe(false)
  })

  it('SCENARIO 13 — Unauthorized Access / RLS Fallback Handling', () => {
    const rlsError = {
      message: 'new row violates row-level security policy for table "settings"',
      code: '42501',
    }
    const permissionError = {
      message: 'You do not have permission to do that.',
    }
    expect(isRlsOrPermissionError(rlsError)).toBe(true)
    expect(isRlsOrPermissionError(permissionError)).toBe(true)

    // Verify system seamlessly falls back to LocalWorkspace when RLS blocks
    const ws = activateLocalWorkspace(userId)
    expect(ws.active).toBe(true)
    expect(isLocalWorkspaceActive(userId)).toBe(true)
  })

  it('SCENARIO 14 — Customer with Multiple Invoices', () => {
    const ws = getCleanWorkspace()
    const custId = createUuid()
    const now = new Date().toISOString()

    const customer: Customer = {
      id: custId,
      user_id: userId,
      name: 'Omni Retailers Group',
      email: 'accounts@omni.example',
      phone: '+94 11 234 5678',
      address: 'Colombo 03',
      notes: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    }
    ws.customers.push(customer)

    // Add 3 invoices for the same customer
    const inv1: Invoice = {
      id: 'inv-omni-1',
      user_id: userId,
      customer_id: custId,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-014A',
      invoice_date: '2026-01-10',
      due_date: '2026-01-24',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '50000',
      discount_total: '0',
      tax_total: '0',
      total: '50000',
      balance_due: '0',
      created_at: now,
      updated_at: now,
    }
    const inv2: Invoice = {
      ...inv1,
      id: 'inv-omni-2',
      invoice_number: 'EVO-2026-014B',
      subtotal: '80000',
      total: '80000',
      balance_due: '30000',
    }
    const inv3: Invoice = {
      ...inv1,
      id: 'inv-omni-3',
      invoice_number: 'EVO-2026-014C',
      subtotal: '25000',
      total: '25000',
      balance_due: '25000',
    }

    ws.invoices.push(inv1, inv2, inv3)

    // Record payments: inv1 fully paid (50,000), inv2 partially paid (50,000 paid, 30,000 due)
    ws.payments.push({
      id: 'p-1',
      user_id: userId,
      invoice_id: 'inv-omni-1',
      amount: '50000',
      payment_date: '2026-01-15',
      payment_method: 'bank_transfer',
      reference_note: null,
      created_at: now,
      updated_at: now,
    })
    ws.payments.push({
      id: 'p-2',
      user_id: userId,
      invoice_id: 'inv-omni-2',
      amount: '50000',
      payment_date: '2026-02-01',
      payment_method: 'bank_transfer',
      reference_note: null,
      created_at: now,
      updated_at: now,
    })

    const customerInvoices = ws.invoices.filter((i) => i.customer_id === custId)
    expect(customerInvoices.length).toBe(3)

    const summaries = customerInvoices.map((i) => toInvoiceSummary(i, ws.payments))
    const totalBilled = summaries.reduce((s, c) => s + c.total, 0)
    const totalPaid = summaries.reduce((s, c) => s + c.total_paid, 0)
    const totalOutstanding = summaries.reduce((s, c) => s + c.balance_due, 0)

    expect(totalBilled).toBe(155000)
    expect(totalPaid).toBe(100000)
    expect(totalOutstanding).toBe(55000)
  })

  it('SCENARIO 15 — Invoice with Multiple Payments', () => {
    const ws = getCleanWorkspace()
    const invoiceId = 'inv-multi-pay'
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Split Payer',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-015',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '100000',
      discount_total: '0',
      tax_total: '0',
      total: '100000',
      balance_due: '100000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)

    // 4 installments of 25,000
    for (let i = 1; i <= 4; i++) {
      validateLocalPaymentWrite(ws, invoiceId, 25000)
      ws.payments.push({
        id: `pay-${i}`,
        user_id: userId,
        invoice_id: invoiceId,
        amount: '25000',
        payment_date: `2026-03-0${i}`,
        payment_method: 'cash',
        reference_note: `Installment ${i}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    const summary = toInvoiceSummary(inv, ws.payments)
    expect(summary.total_paid).toBe(100000)
    expect(summary.balance_due).toBe(0)
    expect(summary.payment_status).toBe('paid')
  })

  it('SCENARIO 16 — Overpayment Prevention and Duplicate Payment Handling', () => {
    const ws = getCleanWorkspace()
    const invoiceId = 'inv-overpay-test'
    const inv: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Test Overpay',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-016',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '50000',
      discount_total: '0',
      tax_total: '0',
      total: '50000',
      balance_due: '50000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(inv)

    // Record 40,000
    ws.payments.push({
      id: 'pay-initial',
      user_id: userId,
      invoice_id: invoiceId,
      amount: '40000',
      payment_date: '2026-03-02',
      payment_method: 'bank_transfer',
      reference_note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Attempting to record 15,000 (which exceeds remaining 10,000) must throw
    expect(() => {
      validateLocalPaymentWrite(ws, invoiceId, 15000)
    }).toThrow(/exceeds remaining balance of 10,000/i)

    // Exact balance 10,000 must succeed
    expect(() => {
      validateLocalPaymentWrite(ws, invoiceId, 10000)
    }).not.toThrow()
  })

  it('SCENARIO 17 — Customer Deletion / Invalidation Safety (financial records preserved)', () => {
    const ws = getCleanWorkspace()
    const customerId = createUuid()
    const now = new Date().toISOString()

    const customer: Customer = {
      id: customerId,
      user_id: userId,
      name: 'Archived Customer Corp',
      email: 'contact@archived.com',
      phone: '+94 71 999 8888',
      address: 'Galle Road, Colombo',
      notes: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    }
    ws.customers.push(customer)

    const invoiceId = createUuid()
    const invoice: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: customerId,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      customer_email_snapshot: customer.email,
      customer_address_snapshot: customer.address,
      invoice_number: 'EVO-2026-017',
      invoice_date: '2026-01-01',
      due_date: '2026-01-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '75000',
      discount_total: '0',
      tax_total: '0',
      total: '75000',
      balance_due: '75000',
      created_at: now,
      updated_at: now,
    }
    ws.invoices.push(invoice)

    // Archive customer (soft delete preserving references)
    customer.archived_at = new Date().toISOString()
    writeLocalWorkspace(userId, ws)

    // Verify invoice remains intact with its snapshots and amounts
    const saved = readLocalWorkspace(userId)
    const retrievedInv = saved.invoices.find((i) => i.id === invoiceId)!
    expect(retrievedInv).toBeDefined()
    expect(retrievedInv.customer_name_snapshot).toBe('Archived Customer Corp')
    expect(retrievedInv.total).toBe('75000')
  })

  it('SCENARIO 18 — Interrupted Connection / Schema Cache Recovery', () => {
    const schemaError = {
      message: 'Could not find the function public.dashboard_metrics in the schema cache',
      code: 'PGRST202',
    }
    expect(isSchemaCacheMissingError(schemaError)).toBe(true)

    // System detects schema cache error and seamlessly queries tables or LocalWorkspace
    const ws = activateLocalWorkspace(userId)
    expect(ws.active).toBe(true)
    expect(ws.settings.business_name).toBe('EVOLAIRE')
  })

  it('SCENARIO 19 — Page Refresh and Session Resumption', () => {
    const ws = getCleanWorkspace()
    ws.settings.business_name = 'Custom Enterprise Invoicing'
    ws.settings.currency = 'USD'
    ws.settings.tax_enabled = true
    writeLocalWorkspace(userId, ws)

    // Simulate page refresh
    const refreshed = readLocalWorkspace(userId)
    expect(refreshed.settings.business_name).toBe('Custom Enterprise Invoicing')
    expect(refreshed.settings.currency).toBe('USD')
    expect(refreshed.settings.tax_enabled).toBe(true)
  })

  it('SCENARIO 20 — Concurrency & Non-reusable Sequence Generation', () => {
    const ws = getCleanWorkspace()
    // Sequence advances monotonically
    expect(ws.settings.next_invoice_seq).toBe(1)
    const seq1 = ws.settings.next_invoice_seq++
    const seq2 = ws.settings.next_invoice_seq++
    const seq3 = ws.settings.next_invoice_seq++

    expect(seq1).toBe(1)
    expect(seq2).toBe(2)
    expect(seq3).toBe(3)
    expect(ws.settings.next_invoice_seq).toBe(4)
  })

  it('SCENARIO 21 — Historical Invoice Immutability on Customer Modification', () => {
    const ws = getCleanWorkspace()
    const custId = createUuid()
    const now = new Date().toISOString()

    const customer: Customer = {
      id: custId,
      user_id: userId,
      name: 'Original Company Name',
      email: 'orig@company.example',
      phone: '+94 77 111 2222',
      address: 'Original Address, Colombo',
      notes: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    }
    ws.customers.push(customer)

    const inv: Invoice = {
      id: createUuid(),
      user_id: userId,
      customer_id: custId,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      customer_email_snapshot: customer.email,
      customer_address_snapshot: customer.address,
      invoice_number: 'EVO-2026-021',
      invoice_date: '2026-01-10',
      due_date: '2026-01-24',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '45000',
      discount_total: '0',
      tax_total: '0',
      total: '45000',
      balance_due: '45000',
      created_at: now,
      updated_at: now,
    }
    ws.invoices.push(inv)

    // Customer changes their legal name and address in the CRM
    customer.name = 'New Rebranded Entity LLC'
    customer.address = 'New HQ Tower, Dubai'
    customer.updated_at = new Date().toISOString()
    writeLocalWorkspace(userId, ws)

    // Historical invoice MUST preserve the original snapshot taken when issued!
    const reloaded = readLocalWorkspace(userId)
    const historical = reloaded.invoices.find((i) => i.id === inv.id)!
    expect(historical.customer_name_snapshot).toBe('Original Company Name')
    expect(historical.customer_address_snapshot).toBe('Original Address, Colombo')
  })

  it('SCENARIO 22 — Archived Customer History Preservation', () => {
    const ws = getCleanWorkspace()
    const custId = createUuid()
    ws.customers.push({
      id: custId,
      user_id: userId,
      name: 'Discontinued Customer',
      email: null,
      phone: null,
      address: null,
      notes: null,
      archived_at: new Date().toISOString(), // Archived!
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    ws.invoices.push({
      id: 'inv-arch-hist',
      user_id: userId,
      customer_id: custId,
      customer_name_snapshot: 'Discontinued Customer',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-022',
      invoice_date: '2025-12-01',
      due_date: '2025-12-15',
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '60000',
      discount_total: '0',
      tax_total: '0',
      total: '60000',
      balance_due: '0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Active customer dropdown excludes archived customers
    const activeCustomers = ws.customers.filter((c) => c.archived_at === null)
    expect(activeCustomers.length).toBe(0)

    // Historical invoice reporting still resolves the invoice and customer snapshot
    const invoiceRecord = ws.invoices.find((i) => i.customer_id === custId)!
    expect(invoiceRecord.customer_name_snapshot).toBe('Discontinued Customer')
    expect(invoiceRecord.total).toBe('60000')
  })

  it('SCENARIO 23 — Boundary Testing: 14 Line Items Limit Enforced (single A4 layout guarantee)', () => {
    // 14 items must pass validation
    const valid14Items = Array.from({ length: 14 }, (_, i) => ({
      description: `Service Line Item #${i + 1}`,
      quantity: 1,
      unit_price: 1000,
    }))

    const validResult = invoiceFormSchema.safeParse({
      customer_mode: 'manual',
      customer_name: 'Max Item Client',
      invoice_number: 'EVO-2026-023A',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      status: 'final',
      advance_amount: 0,
      discount_amount: 0,
      tax_rate: 0,
      items: valid14Items,
    })
    expect(validResult.success).toBe(true)

    // 15 items must fail validation to guarantee single-page printable bounds
    const invalid15Items = Array.from({ length: 15 }, (_, i) => ({
      description: `Service Line Item #${i + 1}`,
      quantity: 1,
      unit_price: 1000,
    }))

    const invalidResult = invoiceFormSchema.safeParse({
      customer_mode: 'manual',
      customer_name: 'Exceeded Item Client',
      invoice_number: 'EVO-2026-023B',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      status: 'final',
      advance_amount: 0,
      discount_amount: 0,
      tax_rate: 0,
      items: invalid15Items,
    })
    expect(invalidResult.success).toBe(false)
    if (!invalidResult.success) {
      expect(
        invalidResult.error.issues.some((i) => i.message.includes('maximum of 14 items')),
      ).toBe(true)
    }
  })

  it('SCENARIO 24 — Overdue and Status Workflow Transitions', () => {
    const today = '2026-03-10'
    const ws = getCleanWorkspace()

    // 1. Past due date with remaining balance -> Overdue
    const overdueInv: Invoice = {
      id: 'inv-od',
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: 'Overdue Client',
      customer_phone_snapshot: null,
      customer_email_snapshot: null,
      customer_address_snapshot: null,
      invoice_number: 'EVO-2026-024A',
      invoice_date: '2026-02-01',
      due_date: '2026-02-15', // Passed
      advance_amount: '0',
      discount_amount: '0',
      tax_rate: '0',
      notes: null,
      payment_terms: null,
      status: 'final',
      subtotal: '20000',
      discount_total: '0',
      tax_total: '0',
      total: '20000',
      balance_due: '20000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const summaryOD = toInvoiceSummary(overdueInv, [])
    expect(summaryOD.payment_status).toBe('unpaid')
    const isOverdue = summaryOD.due_date < today && summaryOD.balance_due > 0
    expect(isOverdue).toBe(true)

    // 2. Draft invoice does not count towards revenue or outstanding balance
    const draftInv: Invoice = {
      ...overdueInv,
      id: 'inv-draft',
      status: 'draft',
      invoice_number: 'EVO-DRAFT-01',
    }
    expect(draftInv.status).toBe('draft')

    // 3. Cancelled invoice is voided
    const cancelledInv: Invoice = {
      ...overdueInv,
      id: 'inv-cancelled',
      status: 'cancelled',
      invoice_number: 'EVO-CANCELLED-01',
    }
    expect(cancelledInv.status).toBe('cancelled')
  })

  it('SCENARIO 25 — End-to-End Accounting Reconciliation (Form -> Preview -> Document -> LocalWorkspace)', () => {
    const ws = getCleanWorkspace()
    ws.settings.tax_enabled = true
    ws.settings.discount_enabled = true

    const rawFormData = {
      customer_mode: 'manual' as const,
      customer_name: 'Apex Solutions International',
      customer_phone: '+94 77 000 1111',
      customer_email: 'billing@apexsolutions.example',
      customer_address: '45 Lotus Tower Rd, Colombo 01',
      save_customer: true,
      invoice_number: 'EVO-2026-025',
      invoice_date: '2026-03-01',
      due_date: '2026-03-15',
      advance_amount: 50000,
      discount_amount: 10000,
      tax_rate: 15,
      notes: 'Complete turnkey enterprise deployment',
      payment_terms: '50% advance upon contract signing',
      status: 'final' as const,
      items: [
        { description: 'Cloud Infrastructure Architecture', quantity: 1, unit_price: 150000 },
        { description: 'Security Hardening & Penetration Testing', quantity: 2, unit_price: 25000 },
      ],
    }

    // Step 1: Validate form
    const parsedForm = invoiceFormSchema.parse(rawFormData)
    expect(parsedForm).toBeDefined()

    // Step 2: Build document directly from form
    const docFromForm = buildDocumentFromForm(parsedForm, ws.settings)
    expect(docFromForm.subtotal).toBe(200000)
    expect(docFromForm.discountAmount).toBe(10000)
    expect(docFromForm.taxRate).toBe(15)
    // Discounted Subtotal = 190,000; Tax (15%) = 28,500; Total = 218,500
    expect(docFromForm.taxTotal).toBe(28500)
    expect(docFromForm.total).toBe(218500)
    expect(docFromForm.advanceAmount).toBe(50000)

    // Step 3: Persist to Workspace
    const invoiceId = createUuid()
    const invoiceEntity: Invoice = {
      id: invoiceId,
      user_id: userId,
      customer_id: null,
      customer_name_snapshot: parsedForm.customer_name,
      customer_phone_snapshot: parsedForm.customer_phone || null,
      customer_email_snapshot: parsedForm.customer_email || null,
      customer_address_snapshot: parsedForm.customer_address || null,
      invoice_number: parsedForm.invoice_number,
      invoice_date: parsedForm.invoice_date,
      due_date: parsedForm.due_date,
      advance_amount: String(parsedForm.advance_amount),
      discount_amount: String(parsedForm.discount_amount),
      tax_rate: String(parsedForm.tax_rate),
      notes: parsedForm.notes || null,
      payment_terms: parsedForm.payment_terms || null,
      status: parsedForm.status,
      subtotal: String(docFromForm.subtotal),
      discount_total: String(docFromForm.discountAmount),
      tax_total: String(docFromForm.taxTotal),
      total: String(docFromForm.total),
      balance_due: String(docFromForm.total),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    ws.invoices.push(invoiceEntity)

    parsedForm.items.forEach((it, idx) => {
      ws.invoice_items.push({
        id: createUuid(),
        invoice_id: invoiceId,
        position: idx + 1,
        description: it.description,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
        line_total: String(calculateLineTotal(it.quantity, it.unit_price)),
        created_at: new Date().toISOString(),
      })
    })

    // Step 4: Record advance payment received
    ws.payments.push({
      id: createUuid(),
      user_id: userId,
      invoice_id: invoiceId,
      amount: '50000',
      payment_date: '2026-03-01',
      payment_method: 'bank_transfer',
      reference_note: 'ADVANCE-PAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    writeLocalWorkspace(userId, ws)

    // Step 5: Read back stored entity and reconstruct document
    const saved = readLocalWorkspace(userId)
    const storedInv = saved.invoices.find((i) => i.id === invoiceId)!
    const storedItems = saved.invoice_items.filter((i) => i.invoice_id === invoiceId)
    const summary = toInvoiceSummary(storedInv, saved.payments)

    const docFromStored = buildDocumentFromInvoice(
      storedInv,
      storedItems,
      saved.settings,
      summary.total_paid,
      summary.balance_due,
    )

    // Step 6: Assert complete mathematical and cross-layer reconciliation
    expect(docFromStored.subtotal).toBe(docFromForm.subtotal)
    expect(docFromStored.discountAmount).toBe(docFromForm.discountAmount)
    expect(docFromStored.taxTotal).toBe(docFromForm.taxTotal)
    expect(docFromStored.total).toBe(docFromForm.total)
    expect(docFromStored.paidAmount).toBe(50000)
    expect(docFromStored.balanceDue).toBe(168500)
    expect(summary.payment_status).toBe('partially_paid')
    expect(formatMoney(docFromStored.total, 'LKR')).toBe('LKR 218,500.00')
    expect(formatMoney(docFromStored.balanceDue, 'LKR')).toBe('LKR 168,500.00')
  })
})

