'use client'

import { useState } from 'react'
import type { VehicleInfo } from '../../lib/types'

export function VehicleHeader({ vehicle }: { vehicle: VehicleInfo | null }) {
  const [copied, setCopied] = useState(false)

  if (!vehicle) {
    return (
      <div className="vehicle-strip">
        <div className="vehicle-icon">▰</div>
        <div>
          <span className="vehicle-label">VEHICLE</span>
          <strong>No vehicle data</strong>
        </div>
      </div>
    )
  }

  const copyVin = () => {
    navigator.clipboard.writeText(vehicle.vin)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="vehicle-strip">
      <div className="vehicle-icon">▰</div>
      <div>
        <span className="vehicle-label">VEHICLE</span>
        <strong>{vehicle.name}</strong>
      </div>
      {vehicle.vin && (
        <div className="vehicle-detail">
          <span>VIN</span>
          <strong>
            {vehicle.vin}
            <button onClick={copyVin} aria-label="Copy VIN">
              {copied ? '✓' : '▣'}
            </button>
          </strong>
        </div>
      )}
      <div className="dtcs">
        {vehicle.dtcs.map((dtc) => (
          <span
            key={dtc.code}
            className={`dtc ${dtc.status === 'active' ? 'red-bg' : dtc.status === 'pending' ? 'amber-bg' : ''}`}
          >
            {dtc.code}
          </span>
        ))}
      </div>
    </div>
  )
}
