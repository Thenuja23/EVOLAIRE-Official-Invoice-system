import { getSupabase } from '@/lib/supabase'
import {
  activateLocalWorkspace,
  createUuid,
  getCurrentUserId,
  isLocalWorkspaceActive,
  isRlsOrPermissionError,
  readLocalWorkspace,
  validateLocalPaymentWrite,
  writeLocalWorkspace,
} from '@/services/serviceUtils'
import type { Payment, PaymentInput } from '@/types/models'

function sortPayments(payments: Payment[]): Payment[] {
  return payments.slice().sort((a, b) => {
    const cmp = b.paid_on.localeCompare(a.paid_on)
    if (cmp !== 0) return cmp
    return b.created_at.localeCompare(a.created_at)
  })
}

export const paymentService = {
  async list(invoiceId: string): Promise<Payment[]> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      return sortPayments(ws.payments.filter((p) => p.invoice_id === invoiceId))
    }

    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        return sortPayments(ws.payments.filter((p) => p.invoice_id === invoiceId))
      }
      throw error
    }
    return (data ?? []) as Payment[]
  },

  async create(input: PaymentInput): Promise<Payment> {
    const userId = await getCurrentUserId()
    const now = new Date().toISOString()
    const localRecord: Payment = {
      id: createUuid(),
      user_id: userId,
      invoice_id: input.invoice_id,
      amount: input.amount,
      paid_on: input.paid_on,
      method: input.method,
      note: input.note?.trim() || null,
      created_at: now,
      updated_at: now,
    }

    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      validateLocalPaymentWrite(ws, input.invoice_id, input.amount)
      ws.payments.push(localRecord)
      writeLocalWorkspace(userId, ws)
      return localRecord
    }

    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .insert({
        user_id: userId,
        invoice_id: input.invoice_id,
        amount: input.amount,
        paid_on: input.paid_on,
        method: input.method,
        note: input.note?.trim() || null,
      })
      .select('*')
      .single()

    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        validateLocalPaymentWrite(ws, input.invoice_id, input.amount)
        ws.payments.push(localRecord)
        writeLocalWorkspace(userId, ws)
        return localRecord
      }
      throw error
    }
    return data as Payment
  },

  async update(id: string, input: PaymentInput): Promise<Payment> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      const target = ws.payments.find((p) => p.id === id)
      if (!target) throw new Error('The requested record could not be found.')
      validateLocalPaymentWrite(ws, target.invoice_id, input.amount, id)
      target.amount = input.amount
      target.paid_on = input.paid_on
      target.method = input.method
      target.note = input.note?.trim() || null
      target.updated_at = new Date().toISOString()
      writeLocalWorkspace(userId, ws)
      return { ...target }
    }

    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .update({
        amount: input.amount,
        paid_on: input.paid_on,
        method: input.method,
        note: input.note?.trim() || null,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        const target = ws.payments.find((p) => p.id === id)
        if (!target) throw new Error('The requested record could not be found.')
        validateLocalPaymentWrite(ws, target.invoice_id, input.amount, id)
        target.amount = input.amount
        target.paid_on = input.paid_on
        target.method = input.method
        target.note = input.note?.trim() || null
        target.updated_at = new Date().toISOString()
        writeLocalWorkspace(userId, ws)
        return { ...target }
      }
      throw error
    }
    return data as Payment
  },

  async remove(id: string): Promise<void> {
    const userId = await getCurrentUserId()
    if (isLocalWorkspaceActive(userId)) {
      const ws = readLocalWorkspace(userId)
      ws.payments = ws.payments.filter((p) => p.id !== id)
      writeLocalWorkspace(userId, ws)
      return
    }

    const client = getSupabase()
    const { error } = await client.from('payments').delete().eq('id', id)
    if (error) {
      if (isRlsOrPermissionError(error)) {
        const ws = activateLocalWorkspace(userId)
        ws.payments = ws.payments.filter((p) => p.id !== id)
        writeLocalWorkspace(userId, ws)
        return
      }
      throw error
    }
  },
}
