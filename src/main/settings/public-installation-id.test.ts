import { describe, expect, it } from 'vitest'
import { createPublicInstallationId } from './public-installation-id'

describe('createPublicInstallationId', () => {
  it('returns a stable non-secret identifier', () => {
    const first = createPublicInstallationId('super-secret-device-id')
    const second = createPublicInstallationId('super-secret-device-id')

    expect(first).toBe(second)
    expect(first).toHaveLength(16)
    expect(first).toMatch(/^[0-9a-f]+$/)
    expect(first).not.toContain('super-secret-device-id')
  })

  it('changes when the source device id changes', () => {
    expect(createPublicInstallationId('device-a')).not.toBe(createPublicInstallationId('device-b'))
  })
})
