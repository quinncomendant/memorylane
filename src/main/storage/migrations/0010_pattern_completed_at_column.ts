import Database from 'better-sqlite3'
import type { Migration } from '../migrator'

export const migration: Migration = {
  name: '0010_pattern_completed_at_column',
  up(db: Database.Database): void {
    db.exec(`ALTER TABLE patterns ADD COLUMN completed_at INTEGER`)
  },
}
