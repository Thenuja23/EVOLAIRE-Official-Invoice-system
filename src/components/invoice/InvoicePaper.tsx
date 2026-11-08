import type { Ref } from 'react'
import { cn } from '@/lib/utils'
import { formatAmount, formatDate, formatQuantity } from '@/lib/format'
import { MAX_INVOICE_ITEMS } from '@/lib/invoice'
import type { InvoiceDocumentData } from '@/types/models'

interface InvoicePaperProps {
  data: InvoiceDocumentData
  innerRef?: Ref<HTMLDivElement>
  className?: string
}

type Row = InvoiceDocumentData['items'][number] | null

export function InvoicePaper({ data, innerRef, className }: InvoicePaperProps) {
  const rows: Row[] = data.items.slice(0, MAX_INVOICE_ITEMS)
  while (rows.length < MAX_INVOICE_ITEMS) rows.push(null)

  const contactLines = [data.business.email, data.business.phone].filter(Boolean)

  return (
    <div ref={innerRef} className={cn('invoice-paper', className)}>
      <header className="invoice-header">
        <div className="invoice-brand">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="" className="invoice-logo" crossOrigin="anonymous" />
          ) : null}
          <div className="invoice-brand-text">
            <h1 className="invoice-brand-name">{data.business.business_name || 'EVOLAIRE'}</h1>
            {contactLines.length > 0 ? (
              <div className="invoice-brand-meta">{contactLines.join('\n')}</div>
            ) : null}
          </div>
        </div>
        <h2 className="invoice-title">INVOICE</h2>
      </header>

      <section className="invoice-meta">
        <div className="invoice-meta-left">
          <p className="invoice-label">Project</p>
          <p className="invoice-project">{data.projectName || '—'}</p>
          <div className="invoice-billto">
            <p className="invoice-label">Bill to</p>
            <p className="invoice-billto-name">{data.customerName || '—'}</p>
          </div>
        </div>
        <div className="invoice-meta-right">
          <div className="invoice-meta-row">
            <span>Invoice No</span>
            <span>{data.invoiceNumber || '—'}</span>
          </div>
          <div className="invoice-meta-row">
            <span>Date</span>
            <span>{formatDate(data.invoiceDate)}</span>
          </div>
          <div className="invoice-meta-row">
            <span>Due Date</span>
            <span>{formatDate(data.dueDate)}</span>
          </div>
        </div>
      </section>

      <table className="invoice-table">
        <colgroup>
          <col className="invoice-col-description" />
          <col className="invoice-col-unit" />
          <col className="invoice-col-price" />
          <col className="invoice-col-total" />
        </colgroup>
        <thead>
          <tr>
            <th className="invoice-col-description">Description</th>
            <th className="invoice-col-unit">Unit</th>
            <th className="invoice-col-price">Price</th>
            <th className="invoice-col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="invoice-cell-description">{row?.description ?? ''}</td>
              <td className="invoice-cell-unit">{row ? formatQuantity(row.unit) : ''}</td>
              <td className="invoice-cell-number">{row ? formatAmount(row.price) : ''}</td>
              <td className="invoice-cell-number">{row ? formatAmount(row.lineTotal) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="invoice-subtotal">
        <div className="invoice-subtotal-box">
          <div className="invoice-subtotal-row is-subtotal">
            <span>SUB TOTAL</span>
            <span>
              {data.currency} {formatAmount(data.subtotal)}
            </span>
          </div>
          {data.showDiscount ? (
            <div className="invoice-subtotal-row">
              <span>DISCOUNT</span>
              <span>
                −{data.currency} {formatAmount(data.discountAmount)}
              </span>
            </div>
          ) : null}
          {data.showTax ? (
            <div className="invoice-subtotal-row">
              <span>TAX ({formatQuantity(data.taxRate)}%)</span>
              <span>
                {data.currency} {formatAmount(data.taxAmount)}
              </span>
            </div>
          ) : null}
          {data.showDiscount || data.showTax ? (
            <div className="invoice-subtotal-row is-total">
              <span>TOTAL</span>
              <span>
                {data.currency} {formatAmount(data.total)}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="invoice-footer">
        <div className="invoice-footer-col">
          <h3 className="invoice-section-title">Payment Details</h3>
          <div className="invoice-bank-row">
            <span>Account holder</span>
            <span>{data.business.bank_account_name}</span>
          </div>
          <div className="invoice-bank-row">
            <span>Account number</span>
            <span>{data.business.bank_account_number}</span>
          </div>
          <div className="invoice-bank-row">
            <span>Bank</span>
            <span>{data.business.bank_name}</span>
          </div>
          <div className="invoice-bank-row">
            <span>Branch</span>
            <span>{data.business.bank_branch}</span>
          </div>
        </div>
        <div className="invoice-footer-col">
          <h3 className="invoice-section-title">Payment Terms</h3>
          <p className="invoice-terms">{data.paymentTerms}</p>
        </div>
      </footer>

      {data.notes.trim() ? <div className="invoice-notes">{data.notes}</div> : null}
    </div>
  )
}
