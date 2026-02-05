import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs';
import { getDefaultDbPath } from '../paths';
import { SearchFilters } from '../../shared/types';

export interface StoredEvent extends Record<string, unknown> {
  id: string;
  timestamp: number;
  text: string;       // OCR extracted text
  summary: string;    // LLM-generated activity summary
  appName: string;    // Active app (e.g., "VS Code", "Chrome")
  vector: number[];
}

export class StorageService {
  private dbPath: string;
  private dbInstance: lancedb.Connection | null = null;
  private tableInstance: lancedb.Table | null = null;
  private readonly TABLE_NAME = 'context_events';

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Helper to get the default database path based on environment.
   */
  public static getDefaultDbPath(): string {
    return getDefaultDbPath();
  }

  /**
   * Initializes the connection and ensures the directory exists.
   */
  public async init(): Promise<void> {
    if (this.dbInstance) return;

    // Ensure directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }

    console.log(`Initializing LanceDB at: ${this.dbPath}`);
    this.dbInstance = await lancedb.connect(this.dbPath);
    
    // Check if table exists
    const tableNames = await this.dbInstance.tableNames();
    if (tableNames.includes(this.TABLE_NAME)) {
      this.tableInstance = await this.dbInstance.openTable(this.TABLE_NAME);
    } else {
      console.log(`Table '${this.TABLE_NAME}' does not exist. It will be created on first insertion.`);
    }
  }

  /**
   * Adds an event to the storage.
   */
  public async addEvent(event: StoredEvent): Promise<void> {
    if (!this.dbInstance) {
      await this.init();
    }
    
    if (!this.dbInstance) throw new Error('Failed to initialize LanceDB connection');

    const data = [event];

    if (!this.tableInstance) {
      // Check again if table exists (race condition check)
      const tableNames = await this.dbInstance.tableNames();
      if (tableNames.includes(this.TABLE_NAME)) {
        this.tableInstance = await this.dbInstance.openTable(this.TABLE_NAME);
        await this.tableInstance.add(data);
      } else {
        // Create table
        this.tableInstance = await this.dbInstance.createTable(this.TABLE_NAME, data);

        // Create FTS index on the 'text' column
        await this.tableInstance.createIndex('text', {
          config: lancedb.Index.fts(),
          replace: true
        });
        console.log('Created FTS index on "text" column.');

        // Create FTS index on the 'summary' column
        await this.tableInstance.createIndex('summary', {
          config: lancedb.Index.fts(),
          replace: true
        });
        console.log('Created FTS index on "summary" column.');
      }
    } else {
      await this.tableInstance.add(data);
    }
  }

  /**
   * Helper to normalize a record's vector to a plain number array.
   */
  private normalizeVector(record: any): StoredEvent {
    let vector: number[] = [];
    if (Array.isArray(record.vector)) {
        vector = record.vector as number[];
    } else if (record.vector && typeof (record.vector as any).toArray === 'function') {
         vector = (record.vector as any).toArray();
    } else if (record.vector) {
        // Fallback for TypedArrays or Arrow Vectors that are iterable
        vector = Array.from(record.vector as Iterable<number>);
    }

    return {
        ...record,
        vector
    } as StoredEvent;
  }

  /**
   * Retrieves an event by ID (helper for testing/verification).
   */
  public async getEventById(id: string): Promise<StoredEvent | null> {
    if (!this.tableInstance) return null;
    
    const results = await this.tableInstance
        .query()
        .where(`id = '${id}'`)
        .limit(1)
        .toArray();
        
    if (results.length === 0) return null;
    
    return this.normalizeVector(results[0]);
  }

  /**
   * Full-text search using FTS index.
   */
  public async searchFTS(query: string, limit = 5): Promise<StoredEvent[]> {
    if (!this.tableInstance) {
      await this.init();
    }
    
    if (!this.tableInstance) return [];

    const results = await this.tableInstance
      .search(query)
      .limit(limit)
      .toArray();

    return results.map(record => this.normalizeVector(record));
  }

  /**
   * Vector similarity search.
   */
  public async searchVectors(queryVector: number[], limit = 5): Promise<StoredEvent[]> {
    if (!this.tableInstance) {
      await this.init();
    }

    if (!this.tableInstance) return [];

    const results = await this.tableInstance
      .vectorSearch(queryVector)
      .limit(limit)
      .toArray();

    return results.map(record => this.normalizeVector(record));
  }

  /**
   * Builds a WHERE clause string from search filters.
   */
  private buildWhereClause(filters?: SearchFilters): string | null {
    if (!filters) return null;

    const conditions: string[] = [];

    if (filters.startTime !== undefined) {
      conditions.push(`timestamp >= ${filters.startTime}`);
    }
    if (filters.endTime !== undefined) {
      conditions.push(`timestamp <= ${filters.endTime}`);
    }
    if (filters.appName !== undefined) {
      // Escape single quotes in app name
      const escapedAppName = filters.appName.replace(/'/g, "''");
      conditions.push(`appName = '${escapedAppName}'`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : null;
  }

  /**
   * Vector similarity search with optional filters.
   */
  public async searchVectorsWithFilters(
    queryVector: number[],
    limit = 5,
    filters?: SearchFilters
  ): Promise<StoredEvent[]> {
    if (!this.tableInstance) {
      await this.init();
    }

    if (!this.tableInstance) return [];

    let query = this.tableInstance.vectorSearch(queryVector);

    const whereClause = this.buildWhereClause(filters);
    if (whereClause) {
      query = query.where(whereClause);
    }

    const results = await query.limit(limit).toArray();

    return results.map(record => this.normalizeVector(record));
  }

  /**
   * FTS search on text and summary columns with optional filters.
   * LanceDB FTS indexes are per-column, so we search both and merge results.
   */
  public async searchFTSWithFilters(
    searchQuery: string,
    limit = 5,
    filters?: SearchFilters
  ): Promise<StoredEvent[]> {
    if (!this.tableInstance) {
      await this.init();
    }

    if (!this.tableInstance) return [];

    const whereClause = this.buildWhereClause(filters);
    const uniqueResults = new Map<string, StoredEvent>();

    // Search on 'text' column (OCR)
    try {
      let textQuery = this.tableInstance.search(searchQuery);
      if (whereClause) {
        textQuery = textQuery.where(whereClause);
      }
      const textResults = await textQuery.limit(limit).toArray();
      textResults.forEach(record => {
        const normalized = this.normalizeVector(record);
        uniqueResults.set(normalized.id, normalized);
      });
    } catch (error) {
      console.warn('FTS search on text column failed:', error);
    }

    // Search on 'summary' column
    try {
      let summaryQuery = this.tableInstance.search(searchQuery, 'summary');
      if (whereClause) {
        summaryQuery = summaryQuery.where(whereClause);
      }
      const summaryResults = await summaryQuery.limit(limit).toArray();
      summaryResults.forEach(record => {
        const normalized = this.normalizeVector(record);
        if (!uniqueResults.has(normalized.id)) {
          uniqueResults.set(normalized.id, normalized);
        }
      });
    } catch (error) {
      console.warn('FTS search on summary column failed:', error);
    }

    // Return up to limit results
    return Array.from(uniqueResults.values()).slice(0, limit);
  }

  /**
   * Returns the total number of events in the database.
   */
  public async countRows(): Promise<number> {
    if (!this.tableInstance) {
      await this.init();
    }
    
    if (!this.tableInstance) return 0;
    
    return await this.tableInstance.countRows();
  }

  /**
   * Returns the date range (oldest and newest timestamps) in the database.
   */
  public async getDateRange(): Promise<{ oldest: number | null; newest: number | null }> {
    if (!this.tableInstance) {
      await this.init();
    }
    
    if (!this.tableInstance) return { oldest: null, newest: null };
    
    // Get oldest entry
    const oldestResults = await this.tableInstance
      .query()
      .select(['timestamp'])
      .limit(1)
      .toArray();
    
    // Get newest entry  
    const newestResults = await this.tableInstance
      .query()
      .select(['timestamp'])
      .limit(1)
      .toArray();
    
    // LanceDB doesn't have ORDER BY in the simple query API, so we need to scan
    // For better performance with large datasets, consider adding an index
    const allTimestamps = await this.tableInstance
      .query()
      .select(['timestamp'])
      .toArray();
    
    if (allTimestamps.length === 0) {
      return { oldest: null, newest: null };
    }
    
    const timestamps = allTimestamps.map(r => r.timestamp as number);
    return {
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps)
    };
  }

  /**
   * Lightweight event type for time-based queries (no vector/text).
   */
  public async getEventsByTimeRange(
    startTime: number | null = null,
    endTime: number | null = null,
    options?: { includeText?: boolean }
  ): Promise<Omit<StoredEvent, 'vector'>[]> {
    if (!this.tableInstance) {
      await this.init();
    }

    if (!this.tableInstance) return [];

    const includeText = options?.includeText ?? false;
    const selectFields = includeText
      ? ['id', 'timestamp', 'summary', 'appName', 'text']
      : ['id', 'timestamp', 'summary', 'appName'];

    

    let query = this.tableInstance.query().select(selectFields);

    // Build where clause only for provided time bounds
    const conditions: string[] = [];
    if (startTime !== null) {
      conditions.push(`timestamp >= ${startTime}`);
    }
    if (endTime !== null) {
      conditions.push(`timestamp <= ${endTime}`);
    }
    if (conditions.length > 0) {
      query = query.where(conditions.join(' AND '));
    }

    const results = await query.toArray();

    // Sort by timestamp ascending
    const sorted = results.sort((a, b) => (a.timestamp as number) - (b.timestamp as number));

    return sorted.map(record => ({
      id: record.id as string,
      timestamp: record.timestamp as number,
      summary: record.summary as string,
      appName: record.appName as string,
      text: includeText ? (record.text as string) : '',
    }));
  }

  /**
   * Returns the database path.
   */
  public getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Closes the connection (mostly for cleanup/testing).
   */
  public async close(): Promise<void> {
    this.dbInstance = null;
    this.tableInstance = null;
  }
}
