// One-time migration: encrypt any plaintext signature images still stored from before
// encryption was added (server/crypto.ts). Safe to re-run — already-encrypted or absent
// signatures are left untouched, so running it twice does nothing the second time.
//
// Covers both the live `plans` table and the `plan_versions` snapshot history, since
// snapshots embed the same approvals data.
//
// Usage:
//   npx tsx server/migrate.ts           (makes a backup, then encrypts in place)
//   npx tsx server/migrate.ts --dry-run (reports what would change, writes nothing)

import { readFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from './db.js'
import { encryptSignature } from './crypto.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

// Load .env.server the same way index.ts does, so SIGNATURE_ENCRYPTION_KEY is available
try {
  const lines = readFileSync(join(__dir, '../.env.server'), 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* .env.server not present — rely on real env vars (e.g. PM2) */ }

if (!process.env.SIGNATURE_ENCRYPTION_KEY) {
  console.error('SIGNATURE_ENCRYPTION_KEY is not set. Aborting — nothing was changed.')
  process.exit(1)
}

const SLOT_KEYS = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3'] as const

function encryptPlaintextSignatures(approvals: any): { approvals: any; changed: number } {
  if (!approvals) return { approvals, changed: 0 }
  let changed = 0
  const result = { ...approvals }
  for (const key of SLOT_KEYS) {
    const slot = approvals[key]
    const sig = slot?.signatureImage
    if (typeof sig === 'string' && sig.startsWith('data:image/')) {
      result[key] = { ...slot, signatureImage: encryptSignature(sig) }
      changed++
    }
  }
  return { approvals: result, changed }
}

function migrateTable(table: 'plans' | 'plan_versions'): number {
  const rows = db.prepare(`SELECT id, data FROM ${table}`).all() as { id: string; data: string }[]
  const update = db.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`)
  let totalChanged = 0

  const run = db.transaction(() => {
    for (const row of rows) {
      const data = JSON.parse(row.data)
      const { approvals, changed } = encryptPlaintextSignatures(data.approvals)
      if (changed === 0) continue
      totalChanged += changed
      console.log(`  ${table}/${row.id}: ${DRY_RUN ? 'would encrypt' : 'encrypted'} ${changed} signature(s)`)
      if (!DRY_RUN) {
        data.approvals = approvals
        update.run(JSON.stringify(data), row.id)
      }
    }
  })
  run()
  return totalChanged
}

console.log(DRY_RUN ? 'DRY RUN — no changes will be written.' : 'Encrypting plaintext signature images in place...')

if (!DRY_RUN) {
  const dbPath = join(__dir, '../activity_plans.db')
  // Ends in .db (not just starts with it) so it's automatically covered by the *.db gitignore rule.
  const backupPath = join(__dir, `../activity_plans.bak-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  copyFileSync(dbPath, backupPath)
  console.log(`Backed up database to ${backupPath}`)
}

const plansChanged = migrateTable('plans')
const versionsChanged = migrateTable('plan_versions')

console.log(
  `Done. plans: ${plansChanged} signature(s) ${DRY_RUN ? 'would be' : ''} encrypted. ` +
  `plan_versions: ${versionsChanged} signature(s) ${DRY_RUN ? 'would be' : ''} encrypted.`
)
