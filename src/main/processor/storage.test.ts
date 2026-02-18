import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { StorageService, StoredActivity } from './storage'
import * as path from 'path'
import * as fs from 'fs'

const deleteDbFiles = (dbPath: string): void => {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = dbPath + suffix
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

const createStoredActivity = (
  overrides: Partial<StoredActivity> & { id: string },
): StoredActivity => ({
  id: overrides.id,
  startTimestamp: overrides.startTimestamp ?? Date.now(),
  endTimestamp: overrides.endTimestamp ?? Date.now() + 60000,
  appName: overrides.appName ?? 'TestApp',
  windowTitle: overrides.windowTitle ?? 'Test Window',
  tld: overrides.tld ?? null,
  summary: overrides.summary ?? 'Test activity summary',
  ocrText: overrides.ocrText ?? 'Sample OCR text',
  vector: overrides.vector ?? [0.1, 0.2, 0.3],
})

describe('StorageService', () => {
  const TEST_DB_PATH = path.join(process.cwd(), 'temp_test.db')
  const VECTOR_DIMS = 3
  let storage: StorageService

  beforeEach(async () => {
    deleteDbFiles(TEST_DB_PATH)
    storage = new StorageService(TEST_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()
  })

  afterEach(async () => {
    await storage.close()
    deleteDbFiles(TEST_DB_PATH)
  })

  it('should add and retrieve an activity with all fields', async () => {
    const activity = createStoredActivity({
      id: 'uuid-1',
      startTimestamp: 1000,
      endTimestamp: 5000,
      appName: 'VS Code',
      summary: 'Editing TypeScript',
      ocrText: 'function hello()',
      vector: [0.1, 0.2, 0.3],
    })

    await storage.addActivity(activity)

    const retrieved = await storage.getActivitiesByIds(['uuid-1'])
    expect(retrieved.length).toBe(1)
    expect(retrieved[0].summary).toBe('Editing TypeScript')
    expect(retrieved[0].appName).toBe('VS Code')
    expect(retrieved[0].ocrText).toBe('function hello()')
    expect(retrieved[0].vector.length).toBe(3)
    expect(retrieved[0].vector[0]).toBeCloseTo(0.1)
  })

  it('should auto-initialize when addActivity is called without prior init', async () => {
    const autoInitStorage = new StorageService(TEST_DB_PATH, { vectorDimensions: VECTOR_DIMS })

    await autoInitStorage.addActivity(
      createStoredActivity({ id: 'auto-init-1', summary: 'Auto init test' }),
    )

    const retrieved = await autoInitStorage.getActivitiesByIds(['auto-init-1'])
    expect(retrieved.length).toBe(1)
    expect(retrieved[0].id).toBe('auto-init-1')
    expect(retrieved[0].summary).toBe('Auto init test')

    await autoInitStorage.close()
  })

  describe('searchActivitiesFTS', () => {
    it('should return matching results ranked by relevance', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-1',
          summary: 'Editing TypeScript handler',
          ocrText: 'function handleRequest()',
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-2',
          summary: 'Reading documentation',
          ocrText: 'TypeScript handbook page',
        }),
      )

      const results = await storage.searchActivitiesFTS('TypeScript', 10)

      expect(results.length).toBe(2)
      const ids = results.map((r) => r.id)
      expect(ids).toContain('fts-1')
      expect(ids).toContain('fts-2')
    })

    it('should return empty array when table is empty', async () => {
      const results = await storage.searchActivitiesFTS('nonexistent', 10)
      expect(results).toEqual([])
    })

    it('should handle special characters in query without throwing', async () => {
      await storage.addActivity(
        createStoredActivity({ id: 'fts-special', summary: 'Testing quotes "hello"' }),
      )

      const results = await storage.searchActivitiesFTS('"hello" world', 10)
      expect(results.length).toBeGreaterThanOrEqual(0)
    })

    it('should filter by appName', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-vs',
          appName: 'VS Code',
          summary: 'TypeScript editing',
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-chrome',
          appName: 'Chrome',
          summary: 'TypeScript docs',
        }),
      )

      const results = await storage.searchActivitiesFTS('TypeScript', 10, {
        appName: 'VS Code',
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('fts-vs')
    })

    it('should filter by time range', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-old',
          startTimestamp: 1000,
          summary: 'TypeScript early',
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-new',
          startTimestamp: 5000,
          summary: 'TypeScript later',
        }),
      )

      const results = await storage.searchActivitiesFTS('TypeScript', 10, {
        startTime: 3000,
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('fts-new')
    })

    it('should return lightweight ActivitySummary without ocrText or vector', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'fts-light',
          summary: 'Lightweight check',
          ocrText: 'should not appear',
        }),
      )

      const results = await storage.searchActivitiesFTS('Lightweight', 10)

      expect(results.length).toBe(1)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('summary')
      expect(results[0]).not.toHaveProperty('ocrText')
      expect(results[0]).not.toHaveProperty('vector')
    })
  })

  describe('searchActivitiesVectors', () => {
    it('should return results ordered by similarity', async () => {
      await storage.addActivity(
        createStoredActivity({ id: 'vec-1', vector: [1.0, 0.0, 0.0], summary: 'First' }),
      )
      await storage.addActivity(
        createStoredActivity({ id: 'vec-2', vector: [0.9, 0.1, 0.0], summary: 'Second' }),
      )
      await storage.addActivity(
        createStoredActivity({ id: 'vec-3', vector: [0.0, 1.0, 0.0], summary: 'Third' }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10)

      expect(results.length).toBe(3)
      expect(results[0].id).toBe('vec-1')
    })

    it('should return empty array on empty table', async () => {
      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10)
      expect(results).toEqual([])
    })

    it('should filter by appName', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'vec-vs',
          appName: 'VS Code',
          vector: [1.0, 0.0, 0.0],
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'vec-chrome',
          appName: 'Chrome',
          vector: [0.9, 0.1, 0.0],
        }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10, {
        appName: 'VS Code',
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('vec-vs')
    })

    it('should filter by time range', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'vec-old',
          startTimestamp: 1000,
          vector: [1.0, 0.0, 0.0],
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'vec-new',
          startTimestamp: 5000,
          vector: [0.9, 0.1, 0.0],
        }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10, {
        startTime: 3000,
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('vec-new')
    })

    it('should handle combined filters (appName + time)', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'combo-1',
          startTimestamp: 1000,
          appName: 'VS Code',
          vector: [1.0, 0.0, 0.0],
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'combo-2',
          startTimestamp: 3000,
          appName: 'VS Code',
          vector: [0.9, 0.1, 0.0],
        }),
      )
      await storage.addActivity(
        createStoredActivity({
          id: 'combo-3',
          startTimestamp: 3000,
          appName: 'Chrome',
          vector: [0.8, 0.2, 0.0],
        }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10, {
        appName: 'VS Code',
        startTime: 2000,
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('combo-2')
    })

    it('should respect limit with filters', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.addActivity(
          createStoredActivity({
            id: `limit-${i}`,
            appName: 'VS Code',
            vector: [1.0 - i * 0.1, i * 0.1, 0.0],
          }),
        )
      }

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 2, {
        appName: 'VS Code',
      })

      expect(results.length).toBe(2)
    })

    it('should return lightweight ActivitySummary without ocrText or vector', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'vec-light',
          vector: [1.0, 0.0, 0.0],
          ocrText: 'should not appear',
        }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10)

      expect(results.length).toBe(1)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('summary')
      expect(results[0]).not.toHaveProperty('ocrText')
      expect(results[0]).not.toHaveProperty('vector')
    })

    it('should handle appName case-insensitively', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'case-1',
          appName: 'VS Code',
          vector: [1.0, 0.0, 0.0],
        }),
      )

      const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10, {
        appName: 'vs code',
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('case-1')
    })
  })

  describe('getActivitiesByTimeRange', () => {
    it('should return activities sorted by start_timestamp', async () => {
      await storage.addActivity(
        createStoredActivity({ id: 'time-2', startTimestamp: 2000, appName: 'Chrome' }),
      )
      await storage.addActivity(
        createStoredActivity({ id: 'time-1', startTimestamp: 1000, appName: 'VS Code' }),
      )

      const results = await storage.getActivitiesByTimeRange(null, null)

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('time-1')
      expect(results[1].id).toBe('time-2')
    })

    it('should filter by time range', async () => {
      await storage.addActivity(createStoredActivity({ id: 'range-1', startTimestamp: 1000 }))
      await storage.addActivity(createStoredActivity({ id: 'range-2', startTimestamp: 2000 }))
      await storage.addActivity(createStoredActivity({ id: 'range-3', startTimestamp: 3000 }))

      const results = await storage.getActivitiesByTimeRange(1500, 2500)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('range-2')
    })

    it('should filter with only startTime', async () => {
      await storage.addActivity(createStoredActivity({ id: 'start-1', startTimestamp: 1000 }))
      await storage.addActivity(createStoredActivity({ id: 'start-2', startTimestamp: 2000 }))
      await storage.addActivity(createStoredActivity({ id: 'start-3', startTimestamp: 3000 }))

      const results = await storage.getActivitiesByTimeRange(2000, null)

      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === 'start-2')).toBeDefined()
      expect(results.find((r) => r.id === 'start-3')).toBeDefined()
    })

    it('should filter with only endTime', async () => {
      await storage.addActivity(createStoredActivity({ id: 'end-1', startTimestamp: 1000 }))
      await storage.addActivity(createStoredActivity({ id: 'end-2', startTimestamp: 2000 }))
      await storage.addActivity(createStoredActivity({ id: 'end-3', startTimestamp: 3000 }))

      const results = await storage.getActivitiesByTimeRange(null, 2000)

      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === 'end-1')).toBeDefined()
      expect(results.find((r) => r.id === 'end-2')).toBeDefined()
    })

    it('should filter by appName case-insensitively', async () => {
      await storage.addActivity(
        createStoredActivity({ id: 'app-1', appName: 'VS Code', startTimestamp: 1000 }),
      )
      await storage.addActivity(
        createStoredActivity({ id: 'app-2', appName: 'Chrome', startTimestamp: 2000 }),
      )

      const results = await storage.getActivitiesByTimeRange(null, null, { appName: 'vs code' })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('app-1')
    })

    it('should return lightweight ActivitySummary without ocrText or vector', async () => {
      await storage.addActivity(
        createStoredActivity({
          id: 'light-1',
          startTimestamp: 1000,
          ocrText: 'should not appear',
        }),
      )

      const results = await storage.getActivitiesByTimeRange(null, null)

      expect(results.length).toBe(1)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('summary')
      expect(results[0]).not.toHaveProperty('ocrText')
      expect(results[0]).not.toHaveProperty('vector')
    })
  })

  describe('getDateRange', () => {
    it('should return correct oldest and newest timestamps', async () => {
      await storage.addActivity(
        createStoredActivity({ id: 'date-1', startTimestamp: 1000, endTimestamp: 3000 }),
      )
      await storage.addActivity(
        createStoredActivity({ id: 'date-2', startTimestamp: 2000, endTimestamp: 5000 }),
      )

      const range = await storage.getDateRange()

      expect(range.oldest).toBe(1000)
      expect(range.newest).toBe(5000)
    })

    it('should return null values when table is empty', async () => {
      const range = await storage.getDateRange()

      expect(range.oldest).toBeNull()
      expect(range.newest).toBeNull()
    })
  })

  describe('countRows', () => {
    it('should return correct count of activities', async () => {
      expect(await storage.countRows()).toBe(0)

      await storage.addActivity(createStoredActivity({ id: 'count-1' }))
      expect(await storage.countRows()).toBe(1)

      await storage.addActivity(createStoredActivity({ id: 'count-2' }))
      expect(await storage.countRows()).toBe(2)
    })
  })
})

// ---------------------------------------------------------------------------
// Legacy context_events migration
// ---------------------------------------------------------------------------

const MIGRATION_DB_PATH = path.join(process.cwd(), 'temp_migration_test.db')
const VECTOR_DIMS = 3

/** Seed a raw SQLite database with the legacy context_events schema. */
function seedLegacyDb(
  rows: {
    id: string
    timestamp: number
    text: string
    summary: string
    appName: string
    vector: number[] | null
  }[],
): void {
  const db = new Database(MIGRATION_DB_PATH)
  sqliteVec.load(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS context_events (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      appName TEXT NOT NULL DEFAULT '',
      vector BLOB
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_context_events_timestamp ON context_events(timestamp)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_context_events_appName ON context_events(appName)')
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS context_events_fts USING fts5(
      text, summary, content='context_events', content_rowid='rowid'
    )
  `)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS context_events_ai AFTER INSERT ON context_events BEGIN
      INSERT INTO context_events_fts(rowid, text, summary) VALUES (new.rowid, new.text, new.summary);
    END
  `)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS context_events_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[${VECTOR_DIMS}]
    )
  `)

  for (const row of rows) {
    const vectorBlob = row.vector ? Buffer.from(new Float32Array(row.vector).buffer) : null
    db.prepare(
      'INSERT INTO context_events (id, timestamp, text, summary, appName, vector) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(row.id, row.timestamp, row.text, row.summary, row.appName, vectorBlob)
    if (vectorBlob) {
      db.prepare('INSERT INTO context_events_vec (id, embedding) VALUES (?, ?)').run(
        row.id,
        vectorBlob,
      )
    }
  }

  db.close()
}

describe('context_events migration', () => {
  afterEach(async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
  })

  it('should migrate rows into activities with correct column mapping', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'evt-1',
        timestamp: 1000,
        text: 'hello world',
        summary: 'greeting',
        appName: 'Terminal',
        vector: [0.1, 0.2, 0.3],
      },
    ])

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    const rows = await storage.getActivitiesByIds(['evt-1'])
    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row.startTimestamp).toBe(1000)
    expect(row.endTimestamp).toBe(1000)
    expect(row.appName).toBe('Terminal')
    expect(row.ocrText).toBe('hello world')
    expect(row.summary).toBe('greeting')
    expect(row.windowTitle).toBe('')
    expect(row.tld).toBeNull()
    expect(row.vector[0]).toBeCloseTo(0.1)

    await storage.close()
  })

  it('should make migrated rows searchable via FTS', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'fts-evt',
        timestamp: 2000,
        text: 'TypeScript compiler',
        summary: 'compiling project',
        appName: 'Terminal',
        vector: [0.1, 0.2, 0.3],
      },
    ])

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    const results = await storage.searchActivitiesFTS('compiling', 10)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe('fts-evt')

    await storage.close()
  })

  it('should make migrated rows searchable via vector similarity', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'vec-evt',
        timestamp: 3000,
        text: 'code review',
        summary: 'reviewing PR',
        appName: 'Chrome',
        vector: [1.0, 0.0, 0.0],
      },
    ])

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    const results = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe('vec-evt')

    await storage.close()
  })

  it('should drop legacy tables after migration', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'drop-evt',
        timestamp: 1000,
        text: 'test',
        summary: 'test',
        appName: 'App',
        vector: [0.1, 0.2, 0.3],
      },
    ])

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    // Verify legacy tables are gone by opening a raw connection
    const db = new Database(MIGRATION_DB_PATH)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'context_events%'")
      .all()
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='context_events_ai'")
      .all()
    db.close()

    expect(tables).toEqual([])
    expect(triggers).toEqual([])

    await storage.close()
  })

  it('should handle NULL vectors gracefully', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'null-vec',
        timestamp: 1000,
        text: 'no vector',
        summary: 'test',
        appName: 'App',
        vector: null,
      },
    ])

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    const rows = await storage.getActivitiesByIds(['null-vec'])
    expect(rows.length).toBe(1)
    expect(rows[0].vector).toEqual([])

    // Vector search should return no results (no vector was inserted)
    const vecResults = await storage.searchActivitiesVectors([1.0, 0.0, 0.0], 10)
    expect(vecResults).toEqual([])

    await storage.close()
  })

  it('should be idempotent (safe to run init() twice)', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([
      {
        id: 'idem-1',
        timestamp: 1000,
        text: 'test',
        summary: 'test',
        appName: 'App',
        vector: [0.1, 0.2, 0.3],
      },
    ])

    const storage1 = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage1.init()
    await storage1.close()

    // Second init on same DB — context_events already dropped, should not throw
    const storage2 = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage2.init()

    const rows = await storage2.getActivitiesByIds(['idem-1'])
    expect(rows.length).toBe(1)

    await storage2.close()
  })

  it('should drop empty legacy table without error', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)
    seedLegacyDb([]) // empty table

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()

    const db = new Database(MIGRATION_DB_PATH)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'context_events%'")
      .all()
    db.close()

    expect(tables).toEqual([])

    await storage.close()
  })

  it('should skip migration on fresh database (no legacy table)', async () => {
    deleteDbFiles(MIGRATION_DB_PATH)

    const storage = new StorageService(MIGRATION_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    // Should not throw — no context_events table to migrate
    await storage.init()

    const count = await storage.countRows()
    expect(count).toBe(0)

    await storage.close()
  })
})
