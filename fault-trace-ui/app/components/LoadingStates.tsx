'use client'

export function PanelSkeleton() {
  return (
    <div className="panel" style={{ minHeight: 120 }}>
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="section-kicker" style={{ background: 'var(--border)', width: 80, height: 10, borderRadius: 2 }} />
          <div style={{ background: 'var(--border)', width: 160, height: 16, borderRadius: 2, marginTop: 8 }} />
        </div>
      </div>
      <div style={{ padding: 18 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ background: 'var(--border)', width: 40, height: 10, borderRadius: 2 }} />
            <div style={{ background: 'var(--border)', width: 9, height: 9, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div style={{ background: 'var(--border)', width: `${70 - i * 15}%`, height: 12, borderRadius: 2 }} />
              <div style={{ background: 'var(--border)', width: `${50 - i * 10}%`, height: 10, borderRadius: 2, marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VehicleSkeleton() {
  return (
    <div className="vehicle-strip" style={{ opacity: 0.5 }}>
      <div className="vehicle-icon">▰</div>
      <div>
        <div style={{ background: 'var(--border)', width: 60, height: 8, borderRadius: 2 }} />
        <div style={{ background: 'var(--border)', width: 180, height: 14, borderRadius: 2, marginTop: 4 }} />
      </div>
    </div>
  )
}

export function SidebarSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ padding: '11px 10px', marginBottom: 3, borderRadius: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ background: 'var(--border)', width: 70, height: 10, borderRadius: 2 }} />
            <div style={{ background: 'var(--border)', width: 40, height: 8, borderRadius: 2 }} />
          </div>
          <div style={{ background: 'var(--border)', width: 120, height: 10, borderRadius: 2, marginTop: 4 }} />
          <div style={{ background: 'var(--border)', width: 80, height: 8, borderRadius: 2, marginTop: 4 }} />
        </div>
      ))}
    </>
  )
}
