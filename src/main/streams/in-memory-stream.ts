import type {
  DurableStream,
  Offset,
  StreamRecord,
  StreamSubscription,
  SubscriptionStartAt,
} from './stream'

interface Subscriber<T> {
  id: number
  nextOffset: Offset
  onRecord: (record: StreamRecord<T>) => void
  active: boolean
}

export class InMemoryStream<T> implements DurableStream<T> {
  private records: StreamRecord<T>[] = []
  private baseOffset: Offset = 0
  private nextOffset: Offset = 0
  private readonly acks = new Map<string, Offset>()
  private readonly subscribers = new Map<number, Subscriber<T>>()
  private nextSubscriberId = 1

  async append(payload: T): Promise<Offset> {
    const offset = this.nextOffset
    const record: StreamRecord<T> = {
      offset,
      timestamp: Date.now(),
      payload,
    }

    this.records.push(record)
    this.nextOffset++

    for (const sub of this.subscribers.values()) {
      this.deliverAvailableToSubscriber(sub)
    }

    return offset
  }

  async get(offset: Offset): Promise<StreamRecord<T> | null> {
    if (!Number.isInteger(offset) || offset < 0) {
      return null
    }

    if (offset < this.baseOffset || offset >= this.nextOffset) {
      return null
    }

    return this.records[offset - this.baseOffset] ?? null
  }

  async ack(consumerId: string, offset: Offset): Promise<void> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Ack offset must be a non-negative integer')
    }
    if (offset >= this.nextOffset) {
      throw new Error('Ack offset must reference an existing record')
    }

    const previous = this.acks.get(consumerId)
    if (previous !== undefined && offset < previous) {
      throw new Error('Ack offset must be monotonic per consumer')
    }

    this.acks.set(consumerId, offset)
  }

  async getAck(consumerId: string): Promise<Offset | null> {
    const value = this.acks.get(consumerId)
    return value ?? null
  }

  subscribe(options: {
    startAt: SubscriptionStartAt
    onRecord: (record: StreamRecord<T>) => void
  }): StreamSubscription {
    const startOffset = this.resolveStartOffset(options.startAt)
    const id = this.nextSubscriberId++
    const sub: Subscriber<T> = {
      id,
      nextOffset: startOffset,
      onRecord: options.onRecord,
      active: true,
    }

    this.subscribers.set(id, sub)

    if (options.startAt.type === 'offset') {
      this.deliverAvailableToSubscriber(sub)
    }

    return {
      unsubscribe: () => {
        const existing = this.subscribers.get(id)
        if (!existing) return
        existing.active = false
        this.subscribers.delete(id)
      },
    }
  }

  async trimBefore(offset: Offset): Promise<number> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Trim offset must be a non-negative integer')
    }

    const target = Math.max(this.baseOffset, Math.min(offset, this.nextOffset))
    const removeCount = target - this.baseOffset
    if (removeCount <= 0) {
      return 0
    }

    this.records.splice(0, removeCount)
    this.baseOffset = target

    for (const sub of this.subscribers.values()) {
      if (sub.nextOffset < this.baseOffset) {
        sub.nextOffset = this.baseOffset
      }
    }

    return removeCount
  }

  async getLowestAvailableOffset(): Promise<Offset> {
    return this.baseOffset
  }

  async getNextOffset(): Promise<Offset> {
    return this.nextOffset
  }

  private resolveStartOffset(startAt: SubscriptionStartAt): Offset {
    if (startAt.type === 'now') {
      return this.nextOffset
    }

    const { offset } = startAt
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Subscription offset must be a non-negative integer')
    }
    return Math.max(offset, this.baseOffset)
  }

  private deliverAvailableToSubscriber(sub: Subscriber<T>): void {
    if (!sub.active) return

    if (sub.nextOffset < this.baseOffset) {
      sub.nextOffset = this.baseOffset
    }

    while (sub.active && sub.nextOffset < this.nextOffset) {
      const record = this.records[sub.nextOffset - this.baseOffset]
      if (!record) {
        break
      }

      sub.nextOffset = record.offset + 1

      try {
        sub.onRecord(record)
      } catch {
        // Callback errors are isolated so one subscriber cannot block others.
      }
    }
  }
}
