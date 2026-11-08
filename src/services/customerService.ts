import { toNumber } from '@/lib/format'
import { roundMoney } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  fetchAllPages,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
} from '@/services/serviceUtils'
import type { Customer, CustomerInput, CustomerStats, Invoice, Payment } from '@/types/models'

function sanitizeSearch(value: string): string {
  return value.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function computeCustomerStatsFallback(customerId: string): Promise<CustomerStats> {
  const client = getSupabase()
  const invoices = await fetchAllPages<Pick<Invoice, 'id' | 'total'>>((from, to) =>
    client
      .from('invoices')
      .select('id, total')
      .eq('customer_id', customerId)
      .eq('status', 'final')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to),
  )

  if (invoices.length === 0) {
    return {
      invoice_count: 0,
      billed: 0,
      paid: 0,
      outstanding: 0,
    }
  }

  const invoiceIds = invoices.map((inv) => inv.id)
  const { data: payments, error: paymentsError } = await client
    .from('payments')
    .select('invoice_id, amount')
    .in('invoice_id', invoiceIds)
  if (paymentsError) throw paymentsError

  const paidByInvoice = new Map<string, number>()
  for (const payment of (payments ?? []) as Array<Pick<Payment, 'invoice_id' | 'amount'>>) {
    paidByInvoice.set(
      payment.invoice_id,
      roundMoney((paidByInvoice.get(payment.invoice_id) ?? 0) + toNumber(payment.amount)),
    )
  }

  let billed = 0
  let paid = 0
  let outstanding = 0

  for (const inv of invoices) {
    const invTotal = toNumber(inv.total)
    const invPaid = paidByInvoice.get(inv.id) ?? 0
    billed = roundMoney(billed + invTotal)
    paid = roundMoney(paid + invPaid)
    outstanding = roundMoney(outstanding + (invTotal - invPaid))
  }

  return {
    invoice_count: invoices.length,
    billed,
    paid,
    outstanding,
  }
}

export const customerService = {
  async list(options: { search?: string; includeDeleted?: boolean } = {}): Promise<Customer[]> {
    const client = getSupabase()
    let query = client.from('customers').select('*').order('name', { ascending: true })

    if (options.includeDeleted) {
      query = query.not('deleted_at', 'is', null)
    } else {
      query = query.is('deleted_at', null)
    }

    const search = sanitizeSearch(options.search ?? '')
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Customer[]
  },

  async getById(id: string): Promise<Customer | null> {
    const client = getSupabase()
    const { data, error } = await client.from('customers').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as Customer | null) ?? null
  },

  async create(input: CustomerInput): Promise<Customer> {
    const client = getSupabase()
    const { data, error } = await client
      .from('customers')
      .insert({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as Customer
  },

  async update(id: string, input: CustomerInput): Promise<Customer> {
    const client = getSupabase()
    const { data, error } = await client
      .from('customers')
      .update({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single()
    if (error) throw error
    return data as Customer
  },

  async softDelete(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async restore(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client.from('customers').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  },

  async permanentlyDelete(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client.from('customers').delete().eq('id', id)
    if (error) throw error
  },

  async stats(customerId: string): Promise<CustomerStats> {
    if (isSchemaFeatureAvailable('customer_stats')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('customer_stats', { p_customer_id: customerId })
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data
        return {
          invoice_count: Number(row?.invoice_count ?? 0),
          billed: Number(row?.billed ?? 0),
          paid: Number(row?.paid ?? 0),
          outstanding: Number(row?.outstanding ?? 0),
        }
      }
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('customer_stats')
    }

    return computeCustomerStatsFallback(customerId)
  },
}
