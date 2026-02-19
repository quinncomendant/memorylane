import Database from 'better-sqlite3'
import type { Migration } from '../migrator'

export const migration: Migration = {
  name: '0001_initial_schema',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER NOT NULL,
        app_name TEXT NOT NULL DEFAULT '',
        window_title TEXT NOT NULL DEFAULT '',
        tld TEXT DEFAULT NULL,
        summary TEXT NOT NULL DEFAULT '',
        ocr_text TEXT NOT NULL DEFAULT '',
        vector BLOB
      )
    `)

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_activities_start_timestamp ON activities(start_timestamp)',
    )
    db.exec('CREATE INDEX IF NOT EXISTS idx_activities_app_name ON activities(app_name)')

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS activities_fts USING fts5(
        summary,
        ocr_text,
        content='activities',
        content_rowid='rowid'
      )
    `)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS activities_ai AFTER INSERT ON activities BEGIN
        INSERT INTO activities_fts(rowid, summary, ocr_text)
          VALUES (new.rowid, new.summary, new.ocr_text);
      END
    `)

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS activities_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[384]
      )
    `)
  },
}
