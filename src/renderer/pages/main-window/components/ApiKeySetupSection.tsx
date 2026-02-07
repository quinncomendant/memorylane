import * as React from 'react'
import { SubscribeColumn } from './SubscribeColumn'
import { BringYourOwnKeyColumn } from './BringYourOwnKeyColumn'
import type { MainWindowAPI } from '../../../../shared/types'

interface ApiKeySetupSectionProps {
  api: MainWindowAPI
  onKeySet: () => void
}

export function ApiKeySetupSection({ api, onKeySet }: ApiKeySetupSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4">
      <SubscribeColumn />
      <BringYourOwnKeyColumn api={api} onKeySet={onKeySet} />
    </div>
  )
}
