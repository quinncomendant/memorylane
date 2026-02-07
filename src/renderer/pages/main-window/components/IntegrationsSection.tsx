import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import type { MainWindowAPI } from '../../../../shared/types'

interface IntegrationsSectionProps {
  api: MainWindowAPI
}

export function IntegrationsSection({ api }: IntegrationsSectionProps): React.JSX.Element {
  const [addingClaude, setAddingClaude] = useState(false)
  const [addingCursor, setAddingCursor] = useState(false)

  const handleAddToClaude = useCallback(async () => {
    setAddingClaude(true)
    try {
      await api.addToClaude()
      toast.success('Added to Claude Desktop')
    } catch {
      toast.error('Failed to add to Claude Desktop')
    } finally {
      setAddingClaude(false)
    }
  }, [api])

  const handleAddToCursor = useCallback(async () => {
    setAddingCursor(true)
    try {
      await api.addToCursor()
      toast.success('Added to Cursor')
    } catch {
      toast.error('Failed to add to Cursor')
    } finally {
      setAddingCursor(false)
    }
  }, [api])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Integrations</CardTitle>
        <CardDescription className="text-xs">
          Register MemoryLane as an MCP server for AI assistants.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={addingClaude}
          onClick={() => void handleAddToClaude()}
        >
          {addingClaude ? 'Adding...' : 'Add to Claude'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={addingCursor}
          onClick={() => void handleAddToCursor()}
        >
          {addingCursor ? 'Adding...' : 'Add to Cursor'}
        </Button>
      </CardContent>
    </Card>
  )
}
