import { InvoicePreview } from '@/components/invoice/InvoicePreview'
import type { InvoiceDocumentData } from '@/types/models'

const sample: InvoiceDocumentData = {
  invoiceNumber: 'EVO-2026-113',
  invoiceDate: '2026-10-31',
  dueDate: '2026-11-07',
  projectName: 'Soul of seafood',
  customerName: 'Maneesha Vithanage',
  notes: '',
  paymentTerms:
    'A 40% advance payment is required to confirm the booking and commence work. The remaining 60% is payable upon completion of the agreed services or according to the agreed billing schedule.',
  business: {
    business_name: 'EVOLAIRE',
    email: 'hello@evolaire.lk',
    phone: '+94 77 123 4567',
    address: 'Colombo, Sri Lanka',
    bank_account_name: 'EVOLAIRE (PVT) LTD',
    bank_account_number: '1234567890',
    bank_name: 'Commercial Bank of Ceylon',
    bank_branch: 'Colombo 03',
    logo_path: null,
  },
  logoUrl: null,
  currency: 'LKR',
  items: [
    {
      description: 'Social Media Handling - Monthly',
      unit: 1,
      price: 35000,
      lineTotal: 35000,
    },
  ],
  subtotal: 35000,
  discountAmount: 0,
  taxRate: 0,
  taxAmount: 0,
  total: 35000,
  showDiscount: false,
  showTax: false,
}

export function DevInvoicePreviewPage() {
  return (
    <div className="min-h-screen bg-ink-100 p-8">
      <div className="mx-auto max-w-[900px]">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-500">
          Invoice document preview
        </p>
        <div className="rounded-sm bg-white shadow-paper">
          <InvoicePreview data={sample} />
        </div>
      </div>
    </div>
  )
}
