import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import * as fs from 'fs'
import * as path from 'path'
import { getDefaultDbPath } from '../paths'
import { SearchFilters } from '../../shared/types'
import log from '../logger'

/**
 * Loads the sqlite-vec extension into the given database.
 * Falls back to manual path resolution for packaged Electron apps where
 * the platform-specific package may be nested or inside app.asar.unpacked.
 */
function loadSqliteVecExtension(db: Database.Database): void {
  try {
    sqliteVec.load(db)
    return
  } catch (defaultError) {
    log.warn(`Default sqlite-vec loader failed, attempting manual resolution: ${defaultError}`)
  }

  const ext = process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'
  const platformName = process.platform === 'win32' ? 'windows' : process.platform
  const packageName = `sqlite-vec-${platformName}-${process.arch}`
  const filename = `vec0.${ext}`

  const searchPaths: string[] = []

  const resourcesPath = 'resourcesPath' in process ? (process.resourcesPath as string) : null
  if (resourcesPath) {
    const unpacked = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules')
    searchPaths.push(
      path.join(unpacked, 'sqlite-vec', 'node_modules', packageName, filename),
      path.join(unpacked, packageName, filename),
    )
  }

  for (const candidate of searchPaths) {
    if (fs.existsSync(candidate)) {
      log.info(`Loading sqlite-vec extension from: ${candidate}`)
      db.loadExtension(candidate)
      return
    }
  }

  throw new Error(
    `sqlite-vec extension not found for ${packageName}. Searched: ${searchPaths.join(', ')}`,
  )
}

export interface StoredEvent extends Record<string, unknown> {
  id: string
  timestamp: number
  text: string
  summary: string
  appName: string
  vector: number[]
}

interface StorageOptions {
  readonly vectorDimensions?: number
}

interface CountRow {
  readonly count: number
}

interface DateRangeRow {
  readonly oldest: number | null
  readonly newest: number | null
}

export class StorageService {
  private dbPath: string
  private db: Database.Database | null = null
  private readonly vectorDimensions: number

  constructor(dbPath: string, options?: StorageOptions) {
    this.dbPath = dbPath
    this.vectorDimensions = options?.vectorDimensions ?? 384
  }

  /**
   * Helper to get the default database path based on environment.
   */
  public static getDefaultDbPath(): string {
    return getDefaultDbPath()
  }

  /**
   * Initializes the SQLite database, creates tables and indexes.
   * Only sets this.db after all setup steps succeed so that a partial
   * failure does not leave the instance in an inconsistent state.
   */
  public async init(): Promise<void> {
    if (this.db) return

    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    log.info(`Initializing SQLite database at: ${this.dbPath}`)
    const db = new Database(this.dbPath)

    try {
      db.pragma('journal_mode = WAL')

      loadSqliteVecExtension(db)

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

      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_context_events_timestamp ON context_events(timestamp)',
      )
      db.exec('CREATE INDEX IF NOT EXISTS idx_context_events_appName ON context_events(appName)')

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS context_events_fts USING fts5(
          text,
          summary,
          content='context_events',
          content_rowid='rowid'
        )
      `)

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS context_events_ai AFTER INSERT ON context_events BEGIN
          INSERT INTO context_events_fts(rowid, text, summary)
            VALUES (new.rowid, new.text, new.summary);
        END
      `)

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS context_events_vec USING vec0(
          id TEXT PRIMARY KEY,
          embedding float[${this.vectorDimensions}]
        )
      `)

      this.db = db
      log.info('SQLite database initialized successfully')
    } catch (error) {
      db.close()
      throw error
    }
  }

  /**
   * Adds an event to the storage.
   */
  public async addEvent(event: StoredEvent): Promise<void> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) throw new Error('Failed to initialize SQLite database')

    const vectorBlob = this.vectorToBlob(event.vector)

    const insert = this.db.transaction(() => {
      this.db!.prepare(
        `INSERT INTO context_events (id, timestamp, text, summary, appName, vector)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(event.id, event.timestamp, event.text, event.summary, event.appName, vectorBlob)

      this.db!.prepare(
        `INSERT INTO context_events_vec (id, embedding)
         VALUES (?, ?)`,
      ).run(event.id, vectorBlob)
    })

    insert()
  }

  /**
   * Retrieves an event by ID.
   */
  public async getEventById(id: string): Promise<StoredEvent | null> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return null

    const row = this.db
      .prepare(
        'SELECT id, timestamp, text, summary, appName, vector FROM context_events WHERE id = ?',
      )
      .get(id) as Record<string, unknown> | undefined

    if (!row) return null
    return this.rowToStoredEvent(row)
  }

  /**
   * Full-text search across text and summary columns.
   */
  public async searchFTS(query: string, limit = 5): Promise<StoredEvent[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return []

    const count = this.getRowCount()
    if (count === 0) return []

    const rows = this.db
      .prepare(
        `SELECT ce.id, ce.timestamp, ce.text, ce.summary, ce.appName, ce.vector
         FROM context_events_fts fts
         JOIN context_events ce ON ce.rowid = fts.rowid
         WHERE context_events_fts MATCH ?
         LIMIT ?`,
      )
      .all(query, limit) as Record<string, unknown>[]

    return rows.map((row) => this.rowToStoredEvent(row))
  }

  /**
   * Vector similarity search.
   */
  public async searchVectors(queryVector: number[], limit = 5): Promise<StoredEvent[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return []

    const count = this.getRowCount()
    if (count === 0) return []

    const vectorBlob = this.vectorToBlob(queryVector)

    const rows = this.db
      .prepare(
        `SELECT ce.id, ce.timestamp, ce.text, ce.summary, ce.appName, ce.vector
         FROM (
           SELECT id, distance
           FROM context_events_vec
           WHERE embedding MATCH ?
           AND k = ?
         ) vec
         JOIN context_events ce ON ce.id = vec.id`,
      )
      .all(vectorBlob, limit) as Record<string, unknown>[]

    return rows.map((row) => this.rowToStoredEvent(row))
  }

  /**
   * Vector similarity search with optional filters.
   */
  public async searchVectorsWithFilters(
    queryVector: number[],
    limit = 5,
    filters?: SearchFilters,
  ): Promise<StoredEvent[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return []

    const count = this.getRowCount()
    if (count === 0) return []

    const hasFilters =
      filters &&
      (filters.startTime !== undefined ||
        filters.endTime !== undefined ||
        filters.appName !== undefined)

    if (!hasFilters) {
      return this.searchVectors(queryVector, limit)
    }

    const vectorBlob = this.vectorToBlob(queryVector)
    const overFetchLimit = Math.max(limit * 10, count)
    const { conditions, params } = this.buildFilterConditions(filters)
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = this.db
      .prepare(
        `SELECT ce.id, ce.timestamp, ce.text, ce.summary, ce.appName, ce.vector
         FROM (
           SELECT id, distance
           FROM context_events_vec
           WHERE embedding MATCH ?
           AND k = ?
         ) vec
         JOIN context_events ce ON ce.id = vec.id
         ${whereClause}
         ORDER BY vec.distance
         LIMIT ?`,
      )
      .all(vectorBlob, overFetchLimit, ...params, limit) as Record<string, unknown>[]

    return rows.map((row) => this.rowToStoredEvent(row))
  }

  /**
   * FTS search across text and summary columns with optional filters.
   */
  public async searchFTSWithFilters(
    searchQuery: string,
    limit = 5,
    filters?: SearchFilters,
  ): Promise<StoredEvent[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return []

    const count = this.getRowCount()
    if (count === 0) return []

    const { conditions, params } = this.buildFilterConditions(filters)
    const filterClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''

    const rows = this.db
      .prepare(
        `SELECT ce.id, ce.timestamp, ce.text, ce.summary, ce.appName, ce.vector
         FROM context_events_fts fts
         JOIN context_events ce ON ce.rowid = fts.rowid
         WHERE context_events_fts MATCH ?
         ${filterClause}
         LIMIT ?`,
      )
      .all(searchQuery, ...params, limit) as Record<string, unknown>[]

    return rows.map((row) => this.rowToStoredEvent(row))
  }

  /**
   * Returns events within a time range, sorted by timestamp ascending.
   */
  public async getEventsByTimeRange(
    startTime: number | null = null,
    endTime: number | null = null,
    options?: { includeText?: boolean },
  ): Promise<Omit<StoredEvent, 'vector'>[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return []

    const includeText = options?.includeText ?? false
    const conditions: string[] = []
    const params: unknown[] = []

    if (startTime !== null) {
      conditions.push('timestamp >= ?')
      params.push(startTime)
    }
    if (endTime !== null) {
      conditions.push('timestamp <= ?')
      params.push(endTime)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = this.db
      .prepare(
        `SELECT id, timestamp, summary, appName${includeText ? ', text' : ''}
         FROM context_events
         ${whereClause}
         ORDER BY timestamp ASC`,
      )
      .all(...params) as Record<string, unknown>[]

    return rows.map((row) => ({
      id: row.id as string,
      timestamp: row.timestamp as number,
      summary: row.summary as string,
      appName: row.appName as string,
      text: includeText ? (row.text as string) : '',
    }))
  }

  /**
   * Retrieves multiple events by their IDs.
   */
  public async getEventsByIds(ids: readonly string[]): Promise<StoredEvent[]> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db || ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, text, summary, appName, vector
         FROM context_events
         WHERE id IN (${placeholders})`,
      )
      .all(...ids) as Record<string, unknown>[]

    return rows.map((row) => this.rowToStoredEvent(row))
  }

  /**
   * Returns the total number of events in the database.
   */
  public async countRows(): Promise<number> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return 0

    return this.getRowCount()
  }

  /**
   * Returns the date range (oldest and newest timestamps) in the database.
   */
  public async getDateRange(): Promise<{ oldest: number | null; newest: number | null }> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) return { oldest: null, newest: null }

    const result = this.db
      .prepare('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM context_events')
      .get() as DateRangeRow

    return {
      oldest: result.oldest ?? null,
      newest: result.newest ?? null,
    }
  }

  /**
   * Returns the database path.
   */
  public getDbPath(): string {
    return this.dbPath
  }

  /**
   * Returns the size of the database file in bytes.
   */
  public getDbSize(): number {
    if (!fs.existsSync(this.dbPath)) return 0
    return fs.statSync(this.dbPath).size
  }

  /**
   * Closes the database connection.
   */
  public async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getRowCount(): number {
    if (!this.db) return 0
    const result = this.db.prepare('SELECT COUNT(*) as count FROM context_events').get() as CountRow
    return result.count
  }

  private vectorToBlob(vector: number[]): Buffer {
    const float32 = new Float32Array(vector)
    return Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength)
  }

  private blobToVector(blob: Buffer): number[] {
    const float32 = new Float32Array(
      blob.buffer,
      blob.byteOffset,
      blob.byteLength / Float32Array.BYTES_PER_ELEMENT,
    )
    return Array.from(float32)
  }

  private rowToStoredEvent(row: Record<string, unknown>): StoredEvent {
    return {
      id: row.id as string,
      timestamp: row.timestamp as number,
      text: row.text as string,
      summary: row.summary as string,
      appName: row.appName as string,
      vector: row.vector ? this.blobToVector(row.vector as Buffer) : [],
    }
  }

  private buildFilterConditions(filters?: SearchFilters): {
    conditions: string[]
    params: unknown[]
  } {
    const conditions: string[] = []
    const params: unknown[] = []

    if (!filters) return { conditions, params }

    if (filters.startTime !== undefined) {
      conditions.push('ce.timestamp >= ?')
      params.push(filters.startTime)
    }
    if (filters.endTime !== undefined) {
      conditions.push('ce.timestamp <= ?')
      params.push(filters.endTime)
    }
    if (filters.appName !== undefined) {
      conditions.push('ce.appName = ?')
      params.push(filters.appName)
    }

    return { conditions, params }
  }
}
