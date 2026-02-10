import { shell } from 'electron'
import log from '../logger'
import { MANAGED_KEY_CONFIG } from '../../shared/constants'
import type { DeviceIdentity } from '../settings/device-identity'
import type { SubscriptionStatus } from '../../shared/types'

export type ManagedKeyCallback = (
  status: SubscriptionStatus,
  payload?: { error?: string; key?: string },
) => void

export class ManagedKeyService {
  private readonly deviceIdentity: DeviceIdentity
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  private status: SubscriptionStatus = 'idle'
  private onUpdate: ManagedKeyCallback | null = null

  constructor(deviceIdentity: DeviceIdentity) {
    this.deviceIdentity = deviceIdentity
  }

  public setUpdateCallback(callback: ManagedKeyCallback): void {
    this.onUpdate = callback
  }

  public getStatus(): SubscriptionStatus {
    return this.status
  }

  /**
   * Try fetching a provisioned key once (e.g. on app startup).
   * Silently does nothing if no key is available yet.
   */
  public async tryFetchKey(): Promise<void> {
    const deviceId = this.deviceIdentity.getDeviceId()
    await this.pollForKey(deviceId)
  }

  /**
   * Open checkout in the system browser and start polling for the provisioned key.
   */
  public async startCheckout(): Promise<void> {
    if (this.status === 'polling' || this.status === 'awaiting_checkout') {
      log.warn('[ManagedKeyService] Checkout already in progress')
      return
    }

    const deviceId = this.deviceIdentity.getDeviceId()

    const url = new URL('/api/checkout', MANAGED_KEY_CONFIG.BACKEND_URL)
    url.searchParams.set('device_id', deviceId)

    this.setStatus('awaiting_checkout')

    await shell.openExternal(url.toString())

    log.info('[ManagedKeyService] Opened checkout in system browser, starting key polling')

    this.startPolling(deviceId)
  }

  public cancelPolling(): void {
    this.clearTimers()
    this.setStatus('idle')
    log.info('[ManagedKeyService] Polling cancelled')
  }

  private startPolling(deviceId: string): void {
    this.setStatus('polling')

    this.pollTimer = setInterval(() => {
      void this.pollForKey(deviceId)
    }, MANAGED_KEY_CONFIG.POLL_INTERVAL_MS)

    this.timeoutTimer = setTimeout(() => {
      log.warn('[ManagedKeyService] Polling timed out')
      this.clearTimers()
      this.setStatus('error', { error: 'Checkout timed out. Please try again.' })
    }, MANAGED_KEY_CONFIG.POLL_TIMEOUT_MS)
  }

  private async pollForKey(deviceId: string): Promise<void> {
    const url = new URL('/api/subscription/key', MANAGED_KEY_CONFIG.BACKEND_URL)
    url.searchParams.set('device_id', deviceId)

    try {
      const response = await fetch(url.toString())

      if (!response.ok) {
        if (response.status >= 500) {
          log.warn(`[ManagedKeyService] Server error during poll: ${response.status}`)
        }
        return
      }

      const data = (await response.json()) as { key?: string | null }

      if (data.key) {
        log.info('[ManagedKeyService] Received provisioned key')
        this.clearTimers()
        this.setStatus('idle', { key: data.key })
      }
    } catch (error) {
      log.warn('[ManagedKeyService] Poll request failed:', error)
    }
  }

  private setStatus(status: SubscriptionStatus, payload?: { error?: string; key?: string }): void {
    this.status = status
    this.onUpdate?.(status, payload)
  }

  private clearTimers(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }
}
