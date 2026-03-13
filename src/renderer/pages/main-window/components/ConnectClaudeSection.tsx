import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Card, CardContent } from '@components/ui/card'
import type { MainWindowAPI, McpRegistrationStatus } from '@types'

interface ConnectClaudeSectionProps {
  api: MainWindowAPI
}

export function ConnectClaudeSection({ api }: ConnectClaudeSectionProps): React.JSX.Element | null {
  const [status, setStatus] = useState<McpRegistrationStatus | null>(null)
  const [connecting, setConnecting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.getMcpStatus())
    } catch {
      // leave status as-is
    }
  }, [api])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      const ok = await api.addToClaude()
      await loadStatus()
      if (ok) {
        toast.success('Connected to Claude Desktop')
      } else {
        toast.error('Failed to connect to Claude Desktop')
      }
    } catch {
      toast.error('Failed to connect to Claude Desktop')
    } finally {
      setConnecting(false)
    }
  }, [api, loadStatus])

  if (status === null || status.claudeDesktop) return null

  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm">Connect to Claude Desktop</span>
        <Button size="sm" disabled={connecting} onClick={() => void handleConnect()}>
          {connecting ? 'Connecting...' : 'Connect'}
        </Button>
      </CardContent>
    </Card>
  )
}
