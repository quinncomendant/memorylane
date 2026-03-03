import { describe, expect, it } from 'vitest'
import type { DurableStream } from './stream'

export function runDurableStreamContractTests(
  suiteName: string,
  createStream: <T>() => DurableStream<T>,
): void {
  describe(suiteName, () => {
    it('assigns monotonic offsets and tracks next offset', async () => {
      const stream = createStream<string>()

      expect(await stream.getLowestAvailableOffset()).toBe(0)
      expect(await stream.getNextOffset()).toBe(0)

      expect(await stream.append('a')).toBe(0)
      expect(await stream.append('b')).toBe(1)
      expect(await stream.getNextOffset()).toBe(2)
    })

    it('returns exact records by offset and null for missing offsets', async () => {
      const stream = createStream<string>()

      await stream.append('a')
      await stream.append('b')

      expect(await stream.get(-1)).toBeNull()
      expect(await stream.get(0)).toMatchObject({ offset: 0, payload: 'a' })
      expect(await stream.get(1)).toMatchObject({ offset: 1, payload: 'b' })
      expect(await stream.get(2)).toBeNull()
    })

    it('tracks monotonic ack per consumer independently', async () => {
      const stream = createStream<string>()

      await stream.append('a')
      await stream.append('b')
      await stream.append('c')

      expect(await stream.getAck('consumer-a')).toBeNull()

      await stream.ack('consumer-a', 0)
      expect(await stream.getAck('consumer-a')).toBe(0)

      await stream.ack('consumer-a', 2)
      expect(await stream.getAck('consumer-a')).toBe(2)

      await stream.ack('consumer-b', 1)
      expect(await stream.getAck('consumer-b')).toBe(1)
      expect(await stream.getAck('consumer-a')).toBe(2)
    })

    it('subscribes from now and receives only new records', async () => {
      const stream = createStream<string>()

      await stream.append('before')

      const seen: string[] = []
      const sub = stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => seen.push(record.payload),
      })

      await stream.append('after-1')
      await stream.append('after-2')

      expect(seen).toEqual(['after-1', 'after-2'])
      sub.unsubscribe()
    })

    it('subscribes from offset and replays before tailing new records', async () => {
      const stream = createStream<string>()

      await stream.append('a')
      await stream.append('b')
      await stream.append('c')

      const seen: string[] = []
      const sub = stream.subscribe({
        startAt: { type: 'offset', offset: 1 },
        onRecord: (record) => seen.push(record.payload),
      })

      expect(seen).toEqual(['b', 'c'])

      await stream.append('d')
      expect(seen).toEqual(['b', 'c', 'd'])

      sub.unsubscribe()
    })

    it('stops delivery after unsubscribe', async () => {
      const stream = createStream<string>()

      const seen: string[] = []
      const sub = stream.subscribe({
        startAt: { type: 'now' },
        onRecord: (record) => seen.push(record.payload),
      })

      await stream.append('a')
      sub.unsubscribe()
      await stream.append('b')

      expect(seen).toEqual(['a'])
    })

    it('trims only older records and preserves offset continuity', async () => {
      const stream = createStream<string>()

      await stream.append('a') // 0
      await stream.append('b') // 1
      await stream.append('c') // 2
      await stream.append('d') // 3

      expect(await stream.trimBefore(2)).toBe(2)
      expect(await stream.getLowestAvailableOffset()).toBe(2)
      expect(await stream.getNextOffset()).toBe(4)

      expect(await stream.get(0)).toBeNull()
      expect(await stream.get(1)).toBeNull()
      expect(await stream.get(2)).toMatchObject({ offset: 2, payload: 'c' })
      expect(await stream.get(3)).toMatchObject({ offset: 3, payload: 'd' })

      expect(await stream.append('e')).toBe(4)
      expect(await stream.get(4)).toMatchObject({ offset: 4, payload: 'e' })
    })

    it('replay subscriptions from trimmed offsets start at lowest available offset', async () => {
      const stream = createStream<string>()

      await stream.append('a') // 0
      await stream.append('b') // 1
      await stream.append('c') // 2
      await stream.append('d') // 3
      await stream.trimBefore(2)

      const seen: string[] = []
      const sub = stream.subscribe({
        startAt: { type: 'offset', offset: 0 },
        onRecord: (record) => seen.push(record.payload),
      })

      expect(seen).toEqual(['c', 'd'])

      await stream.append('e')
      expect(seen).toEqual(['c', 'd', 'e'])

      sub.unsubscribe()
    })
  })
}
