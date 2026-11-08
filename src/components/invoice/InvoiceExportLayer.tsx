import type { Ref } from 'react'
import { InvoicePaper } from './InvoicePaper'
import type { InvoiceDocumentData } from '@/types/models'

/**
 * A full-size, off-screen copy of the invoice. PDF capture and printing use
 * this node so the on-screen scaling never affects the output.
 */
export function InvoiceExportLayer({
  data,
  paperRef,
}: {
  data: InvoiceDocumentData
  paperRef: Ref<HTMLDivElement>
}) {
  return (
    <div className="invoice-export-layer" aria-hidden>
      <InvoicePaper data={data} innerRef={paperRef} />
    </div>
  )
}
