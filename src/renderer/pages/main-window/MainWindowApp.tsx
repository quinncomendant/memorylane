import { useCallback, useEffect, useState } from 'react'
import { Toaster } from '../../components/ui/sonner'
import { useMainWindowAPI } from '../../hooks/use-main-window-api'
import { Logo } from './components/Logo'
import { ApiKeySetupSection } from './components/ApiKeySetupSection'
import { CaptureControlSection } from './components/CaptureControlSection'
import { StatsDisplay } from './components/StatsDisplay'
import { IntegrationsSection } from './components/IntegrationsSection'
import { ManageKeySection } from './components/ManageKeySection'
import type { KeyStatus, MainWindowStats } from '../../../shared/types'

export function MainWindowApp(): React.JSX.Element {
  const api = useMainWindowAPI()
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [stats, setStats] = useState<MainWindowStats | null>(null)

  const loadKeyStatus = useCallback(async () => {
    try {
      const status = await api.getKeyStatus()
      setKeyStatus(status)
    } catch {
      // Silently handle error - key status will remain null
    }
  }, [api])

  const loadStats = useCallback(async () => {
    try {
      const s = await api.getStats()
      setStats(s)
    } catch {
      // Silently handle error
    }
  }, [api])

  const loadAll = useCallback(async () => {
    await Promise.all([loadKeyStatus(), loadStats()])
  }, [loadKeyStatus, loadStats])

  useEffect(() => {
    void api.getStatus().then((status) => setCapturing(status.capturing))
    api.onStatusChanged((status) => {
      setCapturing(status.capturing)
      void loadStats()
    })
    void loadAll()
  }, [api, loadAll, loadStats])

  useEffect(() => {
    const handleFocus = (): void => {
      void loadAll()
      void api.getStatus().then((status) => setCapturing(status.capturing))
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [api, loadAll])

  const handleToggle = useCallback(async () => {
    setToggling(true)
    try {
      const status = await api.toggleCapture()
      setCapturing(status.capturing)
    } finally {
      setToggling(false)
    }
  }, [api])

  const hasKey = keyStatus?.hasKey ?? false

  return (
    <div className="min-h-screen antialiased select-none">
      <div className="p-6 max-w-xl mx-auto space-y-4">
        <Logo />

        {!hasKey ? (
          <ApiKeySetupSection api={api} onKeySet={loadKeyStatus} />
        ) : (
          <>
            <CaptureControlSection
              capturing={capturing}
              toggling={toggling}
              onToggle={() => void handleToggle()}
            />

            <StatsDisplay stats={stats} />

            <IntegrationsSection api={api} />

            {keyStatus && (
              <ManageKeySection
                api={api}
                keyStatus={keyStatus}
                onKeyDeleted={loadKeyStatus}
                onKeyUpdated={loadKeyStatus}
              />
            )}
          </>
        )}
      </div>
      <Toaster />
    </div>
  )
}
