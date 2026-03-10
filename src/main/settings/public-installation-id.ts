import { createHash } from 'node:crypto'

/**
 * Derives a stable, non-secret installation identifier from the private device ID.
 * Safe to use in filenames or UI because it is one-way and truncated.
 */
export function createPublicInstallationId(deviceId: string): string {
  return createHash('sha256')
    .update(`memorylane-installation:${deviceId}`)
    .digest('hex')
    .slice(0, 16)
}
