import * as React from 'react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import type { MainWindowAPI } from '../../../../shared/types'

interface BringYourOwnKeyColumnProps {
  api: MainWindowAPI
  onKeySet: () => void
}

function validateApiKey(key: string): boolean {
  return key.startsWith('sk-or-') && key.length > 10
}

export function BringYourOwnKeyColumn({
  api,
  onKeySet,
}: BringYourOwnKeyColumnProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    const key = inputValue.trim()
    if (key === '') {
      toast.error('Please enter an API key')
      return
    }
    if (!validateApiKey(key)) {
      toast.error('Invalid API key format (should start with sk-or-)')
      return
    }

    setSaving(true)
    try {
      const result = await api.saveApiKey(key)
      if (result.success) {
        setInputValue('')
        toast.success('API key saved successfully')
        onKeySet()
      } else {
        toast.error(result.error ?? 'Failed to save API key')
      }
    } finally {
      setSaving(false)
    }
  }, [api, inputValue, onKeySet])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSave()
      }
    },
    [handleSave],
  )

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bring Your Own Key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Input
            type={passwordVisible ? 'text' : 'password'}
            placeholder="sk-or-v1-..."
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pr-16 font-mono text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setPasswordVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {passwordVisible ? 'Hide' : 'Show'}
          </Button>
        </div>

        <Button className="w-full" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving...' : 'Save Key'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Your key is encrypted and stored locally.
        </p>
      </CardContent>
    </Card>
  )
}
