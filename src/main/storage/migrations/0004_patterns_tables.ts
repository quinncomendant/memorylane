import Database from 'better-sqlite3'
import type { Migration } from '../migrator'

export const migration: Migration = {
  name: '0004_patterns_tables',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        apps TEXT NOT NULL DEFAULT '[]',
        automation_idea TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE pattern_sightings (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL REFERENCES patterns(id),
        detected_at INTEGER NOT NULL,
        run_id TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '',
        activity_ids TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0
      )
    `)
    db.exec(`CREATE INDEX idx_pattern_sightings_pattern_id ON pattern_sightings(pattern_id)`)
    db.exec(`CREATE INDEX idx_pattern_sightings_run_id ON pattern_sightings(run_id)`)
  },
}
