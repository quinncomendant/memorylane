import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import type { MainWindowAPI } from '@types'

interface DatabaseExportSectionProps {
  api: MainWindowAPI
}

export function DatabaseExportSection({ api }: DatabaseExportSectionProps): React.JSX.Element {
  const [isExportingDb, setIsExportingDb] = useState(false)

  const handleExportDatabase = useCallback(async () => {
    setIsExportingDb(true)
    try {
      const result = await api.exportDatabaseZip()
      if (result.cancelled) return
      if (!result.success) {
        toast.error(result.error ?? 'Database export failed')
        return
      }
      toast.success(`Database exported: ${result.outputPath ?? 'ZIP created'}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database export failed'
      toast.error(message)
    } finally {
      setIsExportingDb(false)
    }
  }, [api])

  return (
    <Button size="sm" onClick={() => void handleExportDatabase()} disabled={isExportingDb}>
      {isExportingDb ? 'Exporting...' : 'Export Database (.zip)'}
    </Button>
  )
}
