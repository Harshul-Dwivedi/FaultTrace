'use client'

import { useEffect, useRef } from 'react'
import type { InvestigationData } from '../../lib/types'
import { generateReportHTML } from '../../lib/report'

export function ReportModal({
  data,
  title,
  onClose,
}: {
  data: InvestigationData
  title: string
  onClose: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const html = generateReportHTML(data, { title })
    const doc = iframeRef.current?.contentDocument
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
  }, [data, title])

  const download = () => {
    const html = generateReportHTML(data, { title })
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `faulttrace-report-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const html = generateReportHTML(data, { title })
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.print()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', padding: 24, fontFamily: 'system-ui',
        animation: 'fadeUp .2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', marginBottom: 12, background: '#161b22', border: '1px solid #2b3139',
          borderRadius: 8, color: '#d6e2ea', animation: 'popIn .3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <strong style={{ fontSize: 15 }}>Report Preview</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={download}
            style={{ padding: '7px 14px', border: '1px solid #3f9bff', background: 'transparent', color: '#6ab0ff', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Download HTML
          </button>
          <button
            onClick={print}
            style={{ padding: '7px 14px', border: '1px solid #2b3139', background: '#2b3139', color: '#d6e2ea', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Print / PDF
          </button>
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', border: '1px solid #3a2028', background: 'transparent', color: '#ff8990', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Close
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        style={{ flex: 1, width: '100%', border: '1px solid #2b3139', borderRadius: 8, background: '#fff' }}
        title="Report Preview"
      />
    </div>
  )
}
