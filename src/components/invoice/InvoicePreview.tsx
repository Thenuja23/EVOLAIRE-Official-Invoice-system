import { useEffect, useRef, useState } from 'react'
import { InvoicePaper } from './InvoicePaper'
import type { InvoiceDocumentData } from '@/types/models'

// A4 at 96 dpi, used for responsive screen scaling only.
const A4_WIDTH_PX = 793.7
const A4_HEIGHT_PX = 1122.5

export function InvoicePreview({ data }: { data: InvoiceDocumentData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const width = container.clientWidth
      if (width > 0) setScale(width / A4_WIDTH_PX)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="invoice-preview-shell" style={{ height: A4_HEIGHT_PX * scale }}>
      <div
        style={{
          width: A4_WIDTH_PX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <InvoicePaper data={data} className="shadow-paper" />
      </div>
    </div>
  )
}
