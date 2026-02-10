import { app, safeStorage } from 'electron'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import log from '../logger'

export class DeviceIdentity {
  private configPath: string
  private cached: string | null = null

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'device-identity.json')
  }

  /**
   * Get the device ID, creating and persisting it on first call.
   * This is a cryptographically random 256-bit token that serves as
   * both identifier and credential for backend authentication.
   */
  public getDeviceId(): string {
    if (this.cached) {
      return this.cached
    }

    const stored = this.loadStored()
    if (stored) {
      this.cached = stored
      return stored
    }

    const deviceId = crypto.randomBytes(32).toString('hex')
    this.persist(deviceId)
    this.cached = deviceId

    log.info('[DeviceIdentity] Generated new device ID')
    return deviceId
  }

  private persist(deviceId: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system')
    }

    const encrypted = safeStorage.encryptString(deviceId).toString('base64')
    fs.writeFileSync(this.configPath, JSON.stringify({ deviceId: encrypted }, null, 2))
    log.info('[DeviceIdentity] Device ID persisted securely')
  }

  private loadStored(): string | null {
    if (!fs.existsSync(this.configPath)) {
      return null
    }

    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[DeviceIdentity] Secure storage not available, cannot decrypt device ID')
      return null
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8')
      const config = JSON.parse(configData)

      if (!config.deviceId) {
        return null
      }

      return safeStorage.decryptString(Buffer.from(config.deviceId, 'base64'))
    } catch (error) {
      log.error('[DeviceIdentity] Error reading stored device ID:', error)
      return null
    }
  }
}
