import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import type { MainWindowAPI } from '@types'

interface DatabaseSyncSectionProps {
  api: MainWindowAPI
}

export function DatabaseSyncSection({ api }: DatabaseSyncSectionProps): React.JSX.Element {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = useCallback(async () => {
    setIsSyncing(true)
    try {
      const result = await api.syncDatabaseToRemote()
      if (!result.success) {
        toast.error(result.error ?? 'Sync failed')
        return
      }
      toast.success('Database synced to remote')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      toast.error(message)
    } finally {
      setIsSyncing(false)
    }
  }, [api])

  return (
    <Button size="sm" onClick={() => void handleSync()} disabled={isSyncing}>
      {isSyncing ? 'Syncing...' : 'Sync to Remote'}
    </Button>
  )
}
