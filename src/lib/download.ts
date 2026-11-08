import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
    ),
  )
}

/**
 * Renders the A4 node to a single-page PDF. The invoice document has a fixed
 * 210mm × 297mm box so no page-break heuristics are required.
 */
export async function downloadElementAsPdf(node: HTMLElement, filename: string): Promise<void> {
  // Make sure web fonts and the logo have painted before snapshotting.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Non-critical.
    }
  }
  await waitForImages(node)
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.max(node.scrollWidth, 900),
  })

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const image = canvas.toDataURL('image/jpeg', 0.97)
  pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
  pdf.save(filename)
}

export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCsv(rows: string[][], filename: string): void {
  const escapeCell = (value: string) => {
    const clean = value ?? ''
    return /[",\n\r]/.test(clean) ? `"${clean.replaceAll('"', '""')}"` : clean
  }
  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
  // BOM keeps Excel happy with the rupee symbol / unicode names.
  downloadBlob(`\uFEFF${csv}`, filename, 'text/csv;charset=utf-8')
}

export function downloadJson(value: unknown, filename: string): void {
  downloadBlob(JSON.stringify(value, null, 2), filename, 'application/json')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Excel opens a plain HTML table saved with an .xls extension. This avoids a
 * heavy spreadsheet dependency for the one owner's export needs.
 */
export function downloadExcelHtml(rows: string[][], filename: string, title = 'Invoices'): void {
  const [header, ...body] = rows
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><table border="1" cellspacing="0" cellpadding="6">
<thead><tr>${header
    .map((cell) => `<th style="background:#dce9f6;text-align:left">${escapeHtml(cell)}</th>`)
    .join('')}</tr></thead>
<tbody>${body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table></body></html>`
  downloadBlob(html, filename, 'application/vnd.ms-excel;charset=utf-8')
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsText(file)
  })
}
