import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useCaptureSettingsAPI } from '../../hooks/use-capture-settings-api'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Slider } from '../../components/ui/slider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export function CaptureSettingsSection(): React.JSX.Element {
  const api = useCaptureSettingsAPI()
  const [dhashThreshold, setDhashThreshold] = useState(6)
  const [typingTimeout, setTypingTimeout] = useState(2000)
  const [scrollTimeout, setScrollTimeout] = useState(500)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const sliderChanged = (setter: (v: number) => void) => {
    return (value: number | readonly number[]) => {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined) setter(v)
    }
  }

  const loadSettings = useCallback(async () => {
    try {
      const response = await api.get()
      setDhashThreshold(response.settings.visualDetector.dhashThresholdPercent)
      setTypingTimeout(response.settings.interactionMonitor.typingSessionTimeoutMs)
      setScrollTimeout(response.settings.interactionMonitor.scrollSessionTimeoutMs)
    } catch {
      toast.error('Failed to load capture settings')
    }
  }, [api])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const result = await api.save({
        visualDetector: {
          enabled: true,
          dhashThresholdPercent: dhashThreshold,
        },
        interactionMonitor: {
          enabled: true,
          typingSessionTimeoutMs: typingTimeout,
          scrollSessionTimeoutMs: scrollTimeout,
        },
      })

      if (result.success) {
        toast.success('Capture settings saved')
        await loadSettings()
      } else {
        toast.error(result.error ?? 'Failed to save settings')
      }
    } finally {
      setSaving(false)
    }
  }, [api, dhashThreshold, typingTimeout, scrollTimeout, loadSettings])

  const handleReset = useCallback(async () => {
    setResetting(true)
    try {
      const result = await api.reset()
      if (result.success) {
        toast.success('Settings reset to defaults')
        await loadSettings()
      } else {
        toast.error(result.error ?? 'Failed to reset settings')
      }
    } finally {
      setResetting(false)
    }
  }, [api, loadSettings])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture Settings</CardTitle>
        <CardDescription>Adjust sensitivity and timing for screen capture.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label>Visual Change Threshold</Label>
            <span className="text-sm font-mono text-muted-foreground">{dhashThreshold}%</span>
          </div>
          <Slider
            min={1}
            max={20}
            step={1}
            value={[dhashThreshold]}
            onValueChange={sliderChanged(setDhashThreshold)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lower = more sensitive (more captures). Higher = less sensitive.
          </p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <Label>Typing Session Timeout</Label>
            <span className="text-sm font-mono text-muted-foreground">{typingTimeout}ms</span>
          </div>
          <Slider
            min={500}
            max={5000}
            step={100}
            value={[typingTimeout]}
            onValueChange={sliderChanged(setTypingTimeout)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            How long to wait after last keystroke before ending typing session.
          </p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <Label>Scroll Session Timeout</Label>
            <span className="text-sm font-mono text-muted-foreground">{scrollTimeout}ms</span>
          </div>
          <Slider
            min={200}
            max={2000}
            step={50}
            value={[scrollTimeout]}
            onValueChange={sliderChanged(setScrollTimeout)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            How long to wait after last scroll before ending scroll session.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" disabled={resetting} onClick={() => void handleReset()}>
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
