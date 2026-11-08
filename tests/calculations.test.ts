import { describe, it, expect } from 'vitest'
import {
  advanceAmount,
  calculateDisplayTotals,
  calculateLineTotal,
  roundMoney,
} from '@/lib/invoice'
import {
  addDaysISO,
  addMonthsISO,
  formatAmount,
  formatDate,
  formatDateLong,
  formatMoney,
  formatQuantity,
  initials,
  monthLabel,
  normalizePhoneForWhatsApp,
  parseDateOnly,
  sanitizeFilename,
  toNumber,
} from '@/lib/format'

describe('Invoice Calculation Engine (Phase 2.3)', () => {
  it('calculates line item total with standard inputs', () => {
    expect(calculateLineTotal(1, 35000)).toBe(35000)
    expect(calculateLineTotal(3, 1500)).toBe(4500)
  })

  it('handles decimal quantities and decimal unit prices without JS float artifacts', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    expect(calculateLineTotal(0.1, 0.2)).toBe(0.02)
    expect(calculateLineTotal(2.5, 19.99)).toBe(49.98)
    expect(calculateLineTotal(1.333, 45.67)).toBe(60.88)
  })

  it('calculates totals for single-item invoice without discount or tax', () => {
    const items = [{ unit: 1, price: 35000 }]
    const result = calculateDisplayTotals(items)

    expect(result.subtotal).toBe(35000)
    expect(result.discount).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(35000)
  })

  it('calculates totals for multi-item invoice', () => {
    const items = [
      { unit: 2, price: 10000 },
      { unit: 1, price: 5000 },
      { unit: 4, price: 2500.5 },
    ]
    const result = calculateDisplayTotals(items)

    expect(result.subtotal).toBe(35002)
    expect(result.discount).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(35002)
  })

  it('applies discount correctly when discountEnabled is true', () => {
    const items = [{ unit: 1, price: 10000 }]
    const result = calculateDisplayTotals(items, {
      discountEnabled: true,
      discountAmount: 1500,
    })

    expect(result.subtotal).toBe(10000)
    expect(result.discount).toBe(1500)
    expect(result.total).toBe(8500)
  })

  it('caps discount at subtotal so total cannot be negative', () => {
    const items = [{ unit: 1, price: 5000 }]
    const result = calculateDisplayTotals(items, {
      discountEnabled: true,
      discountAmount: 8000, // Exceeds subtotal
    })

    expect(result.subtotal).toBe(5000)
    expect(result.discount).toBe(5000)
    expect(result.total).toBe(0)
  })

  it('ignores discount when discountEnabled is false even if discountAmount is provided', () => {
    const items = [{ unit: 1, price: 10000 }]
    const result = calculateDisplayTotals(items, {
      discountEnabled: false,
      discountAmount: 2000,
    })

    expect(result.subtotal).toBe(10000)
    expect(result.discount).toBe(0)
    expect(result.total).toBe(10000)
  })

  it('calculates tax percentage on discounted subtotal', () => {
    const items = [{ unit: 2, price: 10000 }] // subtotal: 20000
    const result = calculateDisplayTotals(items, {
      discountEnabled: true,
      discountAmount: 2000, // discounted subtotal: 18000
      taxEnabled: true,
      taxRate: 15, // 15% of 18000 = 2700
    })

    expect(result.subtotal).toBe(20000)
    expect(result.discount).toBe(2000)
    expect(result.tax).toBe(2700)
    expect(result.total).toBe(20700)
  })

  it('handles fractional tax rate and rounds tax to 2 decimals', () => {
    const items = [{ unit: 1, price: 100 }]
    const result = calculateDisplayTotals(items, {
      taxEnabled: true,
      taxRate: 2.5, // 2.5% of 100 = 2.5
    })

    expect(result.subtotal).toBe(100)
    expect(result.tax).toBe(2.5)
    expect(result.total).toBe(102.5)
  })

  it('ignores tax when taxEnabled is false even if taxRate is provided', () => {
    const items = [{ unit: 1, price: 10000 }]
    const result = calculateDisplayTotals(items, {
      taxEnabled: false,
      taxRate: 18,
    })

    expect(result.subtotal).toBe(10000)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(10000)
  })

  it('handles zero-value invoices', () => {
    const items = [{ unit: 1, price: 0 }]
    const result = calculateDisplayTotals(items, {
      discountEnabled: true,
      discountAmount: 0,
      taxEnabled: true,
      taxRate: 10,
    })

    expect(result.subtotal).toBe(0)
    expect(result.discount).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(0)
  })

  it('handles large-value invoices', () => {
    const items = [{ unit: 50, price: 10_000_000 }] // 500,000,000
    const result = calculateDisplayTotals(items, {
      discountEnabled: true,
      discountAmount: 10_000_000,
      taxEnabled: true,
      taxRate: 18,
    })

    expect(result.subtotal).toBe(500_000_000)
    expect(result.discount).toBe(10_000_000)
    expect(result.tax).toBe(88_200_000)
    expect(result.total).toBe(578_200_000)
  })

  it('calculates advance amount based on percentage', () => {
    expect(advanceAmount(100000, 40)).toBe(40000)
    expect(advanceAmount(35000, 40)).toBe(14000)
    expect(advanceAmount(50000, 0)).toBe(0)
    expect(advanceAmount(50000, 100)).toBe(50000)
    expect(advanceAmount(50000, 150)).toBe(50000) // Capped at 100%
  })

  it('roundMoney correctly rounds half up to 2 decimal places', () => {
    expect(roundMoney(10.004)).toBe(10.0)
    expect(roundMoney(10.005)).toBe(10.01)
    expect(roundMoney(10.006)).toBe(10.01)
    expect(roundMoney(-10.005)).toBe(-10.01)
  })
})

describe('Formatting & Date Utilities', () => {
  it('toNumber safely parses numbers and invalid strings', () => {
    expect(toNumber(42)).toBe(42)
    expect(toNumber('123.45')).toBe(123.45)
    expect(toNumber('invalid')).toBe(0)
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber(NaN)).toBe(0)
    expect(toNumber(Infinity)).toBe(0)
  })

  it('formatAmount formats numbers with comma separators and 2 decimal places', () => {
    expect(formatAmount(35000)).toBe('35,000.00')
    expect(formatAmount(0)).toBe('0.00')
    expect(formatAmount(1234567.89)).toBe('1,234,567.89')
  })

  it('formatMoney includes currency prefix and handles negative values', () => {
    expect(formatMoney(35000, 'LKR')).toBe('LKR 35,000.00')
    expect(formatMoney(-5000, 'LKR')).toBe('-LKR 5,000.00')
    expect(formatMoney(100, 'USD')).toBe('USD 100.00')
  })

  it('formatQuantity formats integer without decimals and fractional with decimals', () => {
    expect(formatQuantity(1)).toBe('1')
    expect(formatQuantity(2.5)).toBe('2.5')
    expect(formatQuantity(10.75)).toBe('10.75')
  })

  it('parseDateOnly parses YYYY-MM-DD without timezone shift', () => {
    const d = parseDateOnly('2026-10-31')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9) // 0-indexed October
    expect(d.getDate()).toBe(31)
  })

  it('formatDate formats date into DD/MM/YYYY', () => {
    expect(formatDate('2026-10-31')).toBe('31/10/2026')
    expect(formatDate(null)).toBe('—')
  })

  it('formatDateLong formats date into DD MMM YYYY', () => {
    expect(formatDateLong('2026-10-31')).toBe('31 Oct 2026')
  })

  it('addDaysISO and addMonthsISO manipulate ISO date strings correctly', () => {
    expect(addDaysISO('2026-10-31', 7)).toBe('2026-11-07')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
    expect(addMonthsISO('2026-10-31', 1)).toBe('2026-11-30')
    expect(monthLabel('2026-10-31')).toBe('Oct 2026')
  })

  it('sanitizeFilename cleans forbidden characters and replaces spaces', () => {
    expect(sanitizeFilename('EVO/2026/113')).toBe('EVO2026113')
    expect(sanitizeFilename('Invoice #100: Final')).toBe('Invoice-#100-Final')
    expect(sanitizeFilename('')).toBe('invoice')
  })

  it('normalizePhoneForWhatsApp formats Sri Lankan numbers to international standard', () => {
    expect(normalizePhoneForWhatsApp('0771234567')).toBe('94771234567')
    expect(normalizePhoneForWhatsApp('+94 77 123 4567')).toBe('94771234567')
    expect(normalizePhoneForWhatsApp('0094771234567')).toBe('94771234567')
    expect(normalizePhoneForWhatsApp('771234567')).toBe('94771234567')
    expect(normalizePhoneForWhatsApp('')).toBe('')
  })

  it('initials extracts uppercase initials from name', () => {
    expect(initials('Maneesha Vithanage')).toBe('MV')
    expect(initials('Evolaire')).toBe('E')
    expect(initials('First Middle Last')).toBe('FM')
    expect(initials('')).toBe('')
  })
})

