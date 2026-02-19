import type { Migration } from '../migrator'
import { migration as migration0001 } from './0001_initial_schema'
import { migration as migration0002 } from './0002_migrate_context_events'

export const migrations: Migration[] = [migration0001, migration0002]
