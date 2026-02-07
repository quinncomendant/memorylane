import * as React from 'react'
import logoImage from '../../../../../assets/tray-icon-full-size.png'

export function Logo(): React.JSX.Element {
  return (
    <div className="text-center py-4">
      <div className="inline-flex items-center gap-3">
        <img src={logoImage} alt="MemoryLane" className="w-10 h-10" />
        <h1 className="text-xl font-semibold tracking-tight">MemoryLane</h1>
      </div>
    </div>
  )
}
