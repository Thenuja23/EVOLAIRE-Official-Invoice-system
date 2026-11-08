import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
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
import type { Invoice, LocalWorkspace } from '@/services/serviceUtils'

describe('Local Workspace & State Machine Integrity (Phase 3 & Phase 5)', () => {
  const testUserId = 'test-owner-uuid-1234'
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

  it('initializes default settings with expected business defaults', () => {
    const settings = createDefaultSettings(testUserId)
    expect(settings.user_id).toBe(testUserId)
    expect(settings.business_name).toBe('EVOLAIRE')
    expect(settings.currency).toBe('LKR')
    expect(settings.invoice_prefix).toBe('EVO')
    expect(settings.next_invoice_seq).toBe(1)
    expect(settings.default_due_days).toBe(7)
    expect(settings.advance_percent).toBe(40)
  })

  it('reads and activates local workspace persistently', () => {
    expect(isLocalWorkspaceActive(testUserId)).toBe(false)

    const ws = activateLocalWorkspace(testUserId)
    expect(ws.active).toBe(true)
    expect(isLocalWorkspaceActive(testUserId)).toBe(true)

    const readBack = readLocalWorkspace(testUserId)
    expect(readBack.active).toBe(true)
    expect(readBack.settings.business_name).toBe('EVOLAIRE')
  })

  it('accurately derives PaymentStatus across all states', () => {
    const today = '2026-11-08'

    const base: Invoice = {
      id: 'inv-test',
      user_id: testUserId,
      invoice_number: 'EVO-2026-001',
      customer_id: null,
      customer_name: 'Client A',
      project_name: null,
      invoice_date: '2026-11-01',
      due_date: '2026-11-15',
      status: 'final',
      notes: null,
      payment_terms: null,
      business_snapshot: {},
      discount_amount: 0,
      tax_rate: 0,
      subtotal: 10000,
      total: 10000,
      deleted_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }

    // 1. Draft
    const draftSummary = toInvoiceSummary({ ...base, status: 'draft' }, 0, today)
    expect(draftSummary.payment_status).toBe('Draft')

    // 2. Unpaid (future due date)
    const unpaidSummary = toInvoiceSummary(base, 0, today)
    expect(unpaidSummary.payment_status).toBe('Unpaid')
    expect(unpaidSummary.balance).toBe(10000)

    // 3. Partially Paid
    const partialSummary = toInvoiceSummary(base, 4000, today)
    expect(partialSummary.payment_status).toBe('Partially Paid')
    expect(partialSummary.balance).toBe(6000)

    // 4. Paid (full payment)
    const paidSummary = toInvoiceSummary(base, 10000, today)
    expect(paidSummary.payment_status).toBe('Paid')
    expect(paidSummary.balance).toBe(0)

    // 5. Overdue (past due date with positive balance)
    const overdueSummary = toInvoiceSummary(
      { ...base, due_date: '2026-11-05' },
      0,
      today, // today is 2026-11-08 > 2026-11-05
    )
    expect(overdueSummary.payment_status).toBe('Overdue')
  })

  it('recalculates local invoice totals from line items accurately', () => {
    const ws: LocalWorkspace = {
      active: true,
      settings: createDefaultSettings(testUserId),
      customers: [],
      invoices: [
        {
          id: 'inv-1',
          user_id: testUserId,
          invoice_number: 'EVO-1',
          customer_id: null,
          customer_name: 'Test',
          project_name: null,
          invoice_date: '2026-11-01',
          due_date: '2026-11-08',
          status: 'draft',
          notes: null,
          payment_terms: null,
          business_snapshot: {},
          discount_amount: 0,
          tax_rate: 0,
          subtotal: 0,
          total: 0,
          deleted_at: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      invoice_items: [
        {
          id: 'item-1',
          user_id: testUserId,
          invoice_id: 'inv-1',
          position: 1,
          description: 'Web Development',
          unit: 2,
          price: 25000,
          line_total: 50000,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      payments: [],
      logo_data_url: null,
    }

    recalculateLocalInvoiceTotals(ws, 'inv-1')
    expect(ws.invoices[0].subtotal).toBe(50000)
    expect(ws.invoices[0].total).toBe(50000)
  })

  it('validates payment limits and prevents overpayment', () => {
    const ws: LocalWorkspace = {
      active: true,
      settings: createDefaultSettings(testUserId),
      customers: [],
      invoices: [
        {
          id: 'inv-1',
          user_id: testUserId,
          invoice_number: 'EVO-1',
          customer_id: null,
          customer_name: 'Test',
          project_name: null,
          invoice_date: '2026-11-01',
          due_date: '2026-11-08',
          status: 'final',
          notes: null,
          payment_terms: null,
          business_snapshot: {},
          discount_amount: 0,
          tax_rate: 0,
          subtotal: 10000,
          total: 10000,
          deleted_at: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      invoice_items: [],
      payments: [
        {
          id: 'pay-1',
          user_id: testUserId,
          invoice_id: 'inv-1',
          amount: 4000,
          paid_on: '2026-11-02',
          method: 'bank transfer',
          note: null,
          created_at: '2026-11-02T00:00:00Z',
          updated_at: '2026-11-02T00:00:00Z',
        },
      ],
      logo_data_url: null,
    }

    // Remaining balance is 6000.
    // 1. Payment of 6000 should be allowed
    expect(() => validateLocalPaymentWrite(ws, 'inv-1', 6000)).not.toThrow()

    // 2. Partial payment of 2000 should be allowed
    expect(() => validateLocalPaymentWrite(ws, 'inv-1', 2000)).not.toThrow()

    // 3. Overpayment of 6001 should be rejected
    expect(() => validateLocalPaymentWrite(ws, 'inv-1', 6001)).toThrow(
      /Payment would exceed the outstanding balance/,
    )

    // 4. Payment on trash invoice should be rejected
    ws.invoices[0].deleted_at = '2026-11-03T00:00:00Z'
    expect(() => validateLocalPaymentWrite(ws, 'inv-1', 1000)).toThrow(
      /You cannot record a payment against an invoice in the trash/,
    )
  })

  it('accurately identifies schema cache missing errors and RLS errors', () => {
    expect(isSchemaCacheMissingError({ code: 'PGRST202' })).toBe(true)
    expect(isSchemaCacheMissingError({ code: 'PGRST205' })).toBe(true)
    expect(
      isSchemaCacheMissingError({
        message: 'Could not find the function public.dashboard_metrics in the schema cache',
      }),
    ).toBe(true)
    expect(isSchemaCacheMissingError({ code: '23505' })).toBe(false)

    expect(isRlsOrPermissionError({ code: '42501' })).toBe(true)
    expect(
      isRlsOrPermissionError({
        message: 'new row violates row-level security policy for table "settings"',
      }),
    ).toBe(true)
    expect(isRlsOrPermissionError({ code: '23514' })).toBe(false)
  })

  it('generates unique UUIDs formatted per RFC 4122', () => {
    const uuid1 = createUuid()
    const uuid2 = createUuid()
    expect(uuid1).not.toBe(uuid2)
    expect(uuid1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})
