import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const db = new Database(join(__dirname, '../activity_plans.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft',
    version     TEXT NOT NULL DEFAULT '1.00',
    data        TEXT NOT NULL,
    self_check  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    published_at TEXT
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_requests (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    target_date TEXT NOT NULL DEFAULT '',
    it_number   TEXT NOT NULL DEFAULT '',
    pic         TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )
`)
