import { toNumber } from '@/lib/format'
import { roundMoney } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  activateLocalWorkspace,
  createUuid,
  fetchAllPages,
  getCurrentUserId,
  isLocalWorkspaceActive,
  isRlsOrPermissionError,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
  readLocalWorkspace,
  writeLocalWorkspace,
} from '@/services/serviceUtils'
import type { Customer, CustomerInput, CustomerStats, Invoice, Payment } from '@/types/models'

function sanitizeSearch(value: string): string {
  return value.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function computeStatsFromRecords(
  customerId: string,
  invoices: Array<Pick<Invoice, 'id' | 'customer_id' | 'status' | 'deleted_at' | 'total'>>,
  payments: Array<Pick<Payment, 'invoice_id' | 'amount'>>,
): CustomerStats {
  const finalInvoices = invoices.filter(
    (inv) => inv.customer_id === customerId && inv.status === 'final' && !inv.deleted_at,
  )

  if (finalInvoices.length === 0) {
    return {
      invoice_count: 0,
      billed: 0,
      paid: 0,
      outstanding: 0,
    }
  }

  const paidByInvoice = new Map<string, number>()
  for (const payment of payments) {
    paidByInvoice.set(
      payment.invoice_id,
      roundMoney((paidByInvoice.get(payment.invoice_id) ?? 0) + toNumber(payment.amount)),
    )
  }

  let billed = 0
  let paid = 0
  let outstanding = 0

  for (const inv of finalInvoices) {
    const invTotal = toNumber(inv.total)
    const invPaid = paidByInvoice.get(inv.id) ?? 0
    billed = roundMoney(billed + invTotal)
    paid = roundMoney(paid + invPaid)
    outstanding = roundMoney(outstanding + (invTotal - invPaid))
  }

  return {
    invoice_count: finalInvoices.length,
    billed,
    paid,
    outstanding,
  }
}

async function computeCustomerStatsFallback(customerId: string): Promise<CustomerStats> {
  const userId = await getCurrentUserId()
  if (isLocalWorkspaceActive(userId)) {
    const ws = readLocalWorkspace(userId)
    return computeStatsFromRecords(customerId, ws.invoices, ws.payments)
  }

  const client = getSupabase()
  try {
    const invoices = await fetchAllPages<
      Pick<Invoice, 'id' | 'customer_id' | 'status' | 'deleted_at' | 'total'>
    >((from, to) =>
      client
        .from('invoices')
        .select('id, customer_id, status, deleted_at, total')
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

    return computeStatsFromRecords(
      customerId,
      invoices,
      (payments ?? []) as Array<Pick<Payment, 'invoice_id' | 'amount'>>,
    )
  } catch (error) {
    if (isRlsOrPermissionError(error)) {
      const ws = activateLocalWorkspace(userId)
      return computeStatsFromRecords(customerId, ws.invoices, ws.payments)
    }
    throw error
  }
}

export const customerService = {
  async list(options: { search?: string; includeDeleted?: boolean } = {}): Promise<Customer[]> {
    const userId = await getCurrentUserId()
    const search = sanitizeSearch(options.search ?? '')

    const filterLocal = (customers: Customer[]) => {
      const needle = search.toLowerCase()
      return customers
        .filter((c) => (options.includeDeleted ? Boolean(c.deleted_at) : !c.deleted_at))
        .filter((c) => (!needle ? true : c.name.toLowerCase().includes(needle)))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    if (isLocalWorkspaceActive(userId)) {
      return filterLocal(readLocalWorkspace(userId).customers)
    }

    const client = getSupabase()
    let query = client.from('customers').select('*').order('name', { ascending: true })

    if (options.includeDeleted) {
      query = query.not('deleted_at', 'is', null)
    } else {
      query = query.is('deleted_at', null)
    }

    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error } = await query
    if (error) {
      if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
        return filterLocal(activateLocalWorkspace(userId).customers)
      }
      throw error
    }
    return (data ?? []) as Customer[]
  },

  async getById(id: string): Promise<Customer | null> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      return ws.customers.find((c) => c.id === id) ?? null
    }

    const client = getSupabase()
    const { data, error } = await client.from('customers').select('*').eq('id', id).maybeSingle()
    if (error) {
      if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
        const ws = activateLocalWorkspace(userId)
        return ws.customers.find((c) => c.id === id) ?? null
      }
      throw error
    }
    return (data as Customer | null) ?? null
  },

  async create(input: CustomerInput): Promise<Customer> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    const localRecord: Customer = {
      id: createUuid(),
      user_id: userId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    }

    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      ws.customers.push(localRecord)
      writeLocalWorkspace(userId, ws)
      return localRecord
    }

    const client = getSupabase()
    const { data, error } = await client
      .from('customers')
      .insert({
        user_id: userId,
        name: localRecord.name,
        phone: localRecord.phone,
        email: localRecord.email,
        address: localRecord.address,
        notes: localRecord.notes,
      })
      .select('*')
      .single()

    if (error) {
      if (isRlsOrPermissionError(error) || isSchemaCacheMissingError(error)) {
        const ws = activateLocalWorkspace(userId)
        ws.customers.push(localRecord)
        writeLocalWorkspace(userId, ws)
        return localRecord
      }
      throw error
    }
    return data as Customer
  },

  async update(id: string, input: CustomerInput): Promise<Customer> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.customers.find((c) => c.id === id && !c.deleted_at)
      if (!target) throw new Error('The requested record could not be found.')
      target.name = input.name.trim()
      target.phone = input.phone?.trim() || null
      target.email = input.email?.trim() || null
      target.address = input.address?.trim() || null
      target.notes = input.notes?.trim() || null
      target.updated_at = new Date().toISOString()
      writeLocalWorkspace(userId, ws)
      return { ...target }
    }

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

    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.customers.find((c) => c.id === id && !c.deleted_at)
        if (!target) throw new Error('The requested record could not be found.')
        target.name = input.name.trim()
        target.phone = input.phone?.trim() || null
        target.email = input.email?.trim() || null
        target.address = input.address?.trim() || null
        target.notes = input.notes?.trim() || null
        target.updated_at = new Date().toISOString()
        writeLocalWorkspace(userId, ws)
        return { ...target }
      }
      throw error
    }
    return data as Customer
  },

  async softDelete(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.customers.find((c) => c.id === id)
      if (target) {
        target.deleted_at = now
        target.updated_at = now
        writeLocalWorkspace(userId, ws)
      }
      return
    }

    const client = getSupabase()
    const { error } = await client
      .from('customers')
      .update({ deleted_at: now })
      .eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.customers.find((c) => c.id === id)
        if (target) {
          target.deleted_at = now
          target.updated_at = now
          writeLocalWorkspace(userId, ws)
        }
        return
      }
      throw error
    }
  },

  async restore(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.customers.find((c) => c.id === id)
      if (target) {
        target.deleted_at = null
        target.updated_at = now
        writeLocalWorkspace(userId, ws)
      }
      return
    }

    const client = getSupabase()
    const { error } = await client.from('customers').update({ deleted_at: null }).eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.customers.find((c) => c.id === id)
        if (target) {
          target.deleted_at = null
          target.updated_at = now
          writeLocalWorkspace(userId, ws)
        }
        return
      }
      throw error
    }
  },

  async permanentlyDelete(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      ws.customers = ws.customers.filter((c) => c.id !== id)
      for (const inv of ws.invoices) {
        if (inv.customer_id === id) inv.customer_id = null
      }
      writeLocalWorkspace(userId, ws)
      return
    }

    const client = getSupabase()
    const { error } = await client.from('customers').delete().eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        ws.customers = ws.customers.filter((c) => c.id !== id)
        for (const inv of ws.invoices) {
          if (inv.customer_id === id) inv.customer_id = null
        }
        writeLocalWorkspace(userId, ws)
        return
      }
      throw error
    }
  },

  async stats(customerId: string): Promise<CustomerStats> {
    const userId = await getCurrentUserId()
    if (!isLocalWorkspaceActive(userId) && isSchemaFeatureAvailable('customer_stats')) {
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
      if (!isSchemaCacheMissingError(error) && !isRlsOrPermissionError(error)) throw error
      markSchemaFeatureUnavailable('customer_stats')
    }

    return computeCustomerStatsFallback(customerId)
  },
}
