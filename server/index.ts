import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from './db.js'
import { sendPlanPublishedEmail, sendResubmittedEmail, sendSlotApprovedEmail, sendFullyApprovedEmail, sendRevisionEmail, sendRejectedEmail } from './mailer.js'

// Load .env.server for local development (production uses PM2 env vars)
try {
  const __dir = dirname(fileURLToPath(import.meta.url))
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
} catch { /* .env.server not present in production — fine */ }

const app = express()
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '20mb' }))

const now = () => new Date().toISOString()

function saveVersionSnapshot(planId: string, version: string, event: string, data: any) {
  try {
    db.prepare(
      'INSERT INTO plan_versions (id, plan_id, version, event, data, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(randomUUID(), planId, version, event, JSON.stringify(data), now())
  } catch { /* non-critical — don't fail the main operation */ }
}

function bumpVersion(version: string): string {
  const parts = version.split('.')
  const major = parseInt(parts[0], 10) || 1
  const minor = parseInt(parts[1] || '0', 10)
  return `${major}.${String(minor + 1).padStart(2, '0')}`
}

// ── List all plans (summary for dashboard) ───────────────────────────────────
app.get('/api/plans', (_req, res) => {
  const rows = (db.prepare(
    'SELECT id, title, type, status, version, created_at, updated_at, published_at, data FROM plans ORDER BY updated_at DESC'
  ).all()) as any[]

  const plans = rows.map(row => {
    const data = JSON.parse(row.data)
    const approvals = data.approvals ?? {}
    const approvalCount = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
      .filter(k => approvals[k]?.signatureImage).length

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      approvalCount,
      picName: data.approvals?.preparedBy?.name || '',
      itNumber: data.itNumber ?? '',
      groupType: data.groupType ?? null,
      targetDate: data.targetDate ?? null,
      months: data.months ?? [],
      activities: data.activities ?? [],
    }
  })
  res.json(plans)
})

// ── Get full plan by ID ───────────────────────────────────────────────────────
app.get('/api/plans/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  res.json({
    plan: JSON.parse(row.data),
    selfCheck: row.self_check ? JSON.parse(row.self_check) : null,
  })
})

// ── Create plan ───────────────────────────────────────────────────────────────
app.post('/api/plans', (req, res) => {
  const { plan, selfCheck } = req.body
  const id = plan.id || randomUUID()
  const ts = now()
  const planData = { ...plan, id }
  db.prepare(`
    INSERT INTO plans (id, title, type, status, version, data, self_check, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).run(
    id,
    plan.title || '',
    plan.type,
    plan.documentVersion || '1.00',
    JSON.stringify(planData),
    selfCheck ? JSON.stringify(selfCheck) : null,
    ts,
    ts
  )
  res.json({ id })
})

// ── Update plan (only allowed when draft or for_revision) ─────────────────────
app.put('/api/plans/:id', (req, res) => {
  const { plan, selfCheck } = req.body
  const row = db.prepare('SELECT status FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  if (['published', 'ongoing_approval', 'cancelled'].includes(row.status)) {
    return res.status(403).json({ error: 'Plan is locked and cannot be modified' })
  }
  const ts = now()
  db.prepare(`
    UPDATE plans SET title = ?, version = ?, data = ?, self_check = ?, updated_at = ? WHERE id = ?
  `).run(
    plan.title || '',
    plan.documentVersion || '1.00',
    JSON.stringify(plan),
    selfCheck ? JSON.stringify(selfCheck) : null,
    ts,
    req.params.id
  )
  res.json({ ok: true })
})

// ── Delete plan ───────────────────────────────────────────────────────────────
app.delete('/api/plans/:id', (req, res) => {
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Submit plan for approval (PIC locks it, status → ongoing_approval) ───────
app.post('/api/plans/:id/publish', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const ts = now()
  const data = JSON.parse(row.data)
  data.status = 'ongoing_approval'
  data.publishedAt = ts
  db.prepare(`
    UPDATE plans SET status = 'ongoing_approval', published_at = ?, data = ?, updated_at = ? WHERE id = ?
  `).run(ts, JSON.stringify(data), ts, req.params.id)

  saveVersionSnapshot(req.params.id, data.documentVersion ?? row.version, 'submitted', data)

  // Queue Teams notification
  const slotKeys = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3'] as const
  const approvers = slotKeys
    .map(k => data.approvals?.[k])
    .filter((s: any) => s?.name?.trim())
    .map((s: any) => ({ name: s.name, role: s.role, email: s.email ?? '' }))
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://10.164.16.18:1011'
  const viewLink = `${frontendOrigin}/view/${req.params.id}`

  db.prepare(`
    INSERT INTO notifications (id, plan_id, plan_title, it_number, plan_type, view_link, approvers, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), req.params.id,
    data.title ?? '', data.itNumber ?? '', data.type ?? '',
    viewLink, JSON.stringify(approvers), ts
  )

  // Send email notification (best-effort)
  sendPlanPublishedEmail({
    planId: req.params.id,
    planTitle: data.title ?? '',
    itNumber: data.itNumber ?? '',
    planType: data.type ?? '',
    documentVersion: data.documentVersion ?? '',
    viewLink,
    publishedAt: ts,
    approvers,
  }).catch(err => console.error('[mailer] Failed to send email:', err.message))

  res.json({ ok: true })
})

// ── Send for revision (approver → PIC can edit again, version bumps) ──────────
app.post('/api/plans/:id/revision', (req, res) => {
  const { reason, by } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  const newVersion = bumpVersion(row.version)
  data.status = 'for_revision'
  data.documentVersion = newVersion
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: newVersion, date: new Date().toISOString().slice(0, 10), reason: reason || 'For revision', by: by || '' },
  ]
  const ts = now()
  db.prepare(`
    UPDATE plans SET status = 'for_revision', version = ?, data = ?, updated_at = ? WHERE id = ?
  `).run(newVersion, JSON.stringify(data), ts, req.params.id)
  saveVersionSnapshot(req.params.id, newVersion, 'for_revision', data)
  res.json({ ok: true, newVersion })

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://10.164.16.18:1011'
  sendRevisionEmail({
    planId: req.params.id,
    planTitle: data.title ?? '',
    itNumber: data.itNumber ?? '',
    viewLink: `${frontendOrigin}/view/${req.params.id}`,
    reason: reason || '',
    by: by || '',
    pic: { name: data.approvals?.preparedBy?.name ?? '', email: data.approvals?.preparedBy?.email ?? '' },
  }).catch(err => console.error('[mailer] revision email failed:', err.message))
})

// ── Re-submit after revision (version bumps, status → ongoing_approval) ──────
app.post('/api/plans/:id/republish', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  if (!['for_revision', 'rejected'].includes(row.status)) {
    return res.status(400).json({ error: 'Plan is not in for_revision or rejected state' })
  }
  const data = JSON.parse(row.data)
  const newVersion = bumpVersion(row.version)
  const ts = now()
  data.status = 'ongoing_approval'
  data.documentVersion = newVersion
  data.publishedAt = ts
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: newVersion, date: new Date().toISOString().slice(0, 10), reason: 'Re-submitted for approval after revision', by: req.body.by || '' },
  ]
  db.prepare(`
    UPDATE plans SET status = 'ongoing_approval', version = ?, published_at = ?, data = ?, updated_at = ? WHERE id = ?
  `).run(newVersion, ts, JSON.stringify(data), ts, req.params.id)
  saveVersionSnapshot(req.params.id, newVersion, 'resubmitted', data)

  const frontendOriginR = process.env.FRONTEND_ORIGIN ?? 'http://10.164.16.18:1011'
  const slotKeysR = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3'] as const
  const approversR = slotKeysR
    .map(k => data.approvals?.[k])
    .filter((s: any) => s?.name?.trim())
    .map((s: any) => ({ name: s.name, role: s.role, email: s.email ?? '' }))
  sendResubmittedEmail({
    planId: req.params.id,
    planTitle: data.title ?? '',
    itNumber: data.itNumber ?? '',
    planType: data.type ?? '',
    documentVersion: newVersion,
    viewLink: `${frontendOriginR}/view/${req.params.id}`,
    publishedAt: ts,
    approvers: approversR,
  }).catch(err => console.error('[mailer] resubmit email failed:', err.message))

  res.json({ ok: true, newVersion })
})

// ── Manual version up ─────────────────────────────────────────────────────────
app.post('/api/plans/:id/version-up', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  const parts = row.version.split('.')
  const major = parseInt(parts[0], 10) || 1
  const newVersion = `${major + 1}.00`
  data.documentVersion = newVersion
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: newVersion, date: new Date().toISOString().slice(0, 10), reason: req.body.reason || 'Manual version up', by: req.body.by || '' },
  ]
  const ts = now()
  db.prepare(`
    UPDATE plans SET version = ?, status = 'for_revision', data = ?, updated_at = ? WHERE id = ?
  `).run(newVersion, JSON.stringify(data), ts, req.params.id)
  saveVersionSnapshot(req.params.id, newVersion, 'version_up', data)
  res.json({ ok: true, newVersion })
})

// ── Plan version snapshots ────────────────────────────────────────────────────

app.get('/api/plans/:id/versions', (req, res) => {
  const rows = db.prepare(
    'SELECT version, event, created_at FROM plan_versions WHERE plan_id = ? ORDER BY created_at ASC'
  ).all(req.params.id) as any[]
  res.json(rows.map(r => ({ version: r.version, event: r.event, createdAt: r.created_at })))
})

app.get('/api/plans/:id/versions/:version', (req, res) => {
  const row = db.prepare(
    'SELECT data FROM plan_versions WHERE plan_id = ? AND version = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.id, req.params.version) as any
  if (!row) return res.status(404).json({ error: 'Snapshot not found' })
  res.json({ data: JSON.parse(row.data) })
})

// ── Reject plan ───────────────────────────────────────────────────────────────
app.post('/api/plans/:id/reject', (req, res) => {
  const { reason, by } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  data.status = 'rejected'
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: row.version, date: new Date().toISOString().slice(0, 10), reason: `Rejected: ${reason || 'No reason given'}`, by: by || '' },
  ]
  const ts = now()
  db.prepare('UPDATE plans SET status = ?, data = ?, updated_at = ? WHERE id = ?')
    .run('rejected', JSON.stringify(data), ts, req.params.id)
  res.json({ ok: true })

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://10.164.16.18:1011'
  sendRejectedEmail({
    planId: req.params.id,
    planTitle: data.title ?? '',
    itNumber: data.itNumber ?? '',
    viewLink: `${frontendOrigin}/view/${req.params.id}`,
    reason: reason || '',
    by: by || '',
    pic: { name: data.approvals?.preparedBy?.name ?? '', email: data.approvals?.preparedBy?.email ?? '' },
  }).catch(err => console.error('[mailer] rejected email failed:', err.message))
})

// ── Cancel plan (PIC only) ────────────────────────────────────────────────────
app.post('/api/plans/:id/cancel', (req, res) => {
  const { by } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  data.status = 'cancelled'
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: row.version, date: new Date().toISOString().slice(0, 10), reason: 'Project cancelled', by: by || '' },
  ]
  const ts = now()
  db.prepare('UPDATE plans SET status = ?, data = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', JSON.stringify(data), ts, req.params.id)
  res.json({ ok: true })
})

// ── Save progress (actual marks + status) when plan is published & fully approved ──
app.post('/api/plans/:id/save-progress', (req, res) => {
  const { activities } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  if (row.status !== 'published') {
    return res.status(403).json({ error: 'Progress save only allowed on published (fully approved) plans' })
  }
  const updated = (data.activities as any[]).map((act: any) => {
    const incoming = (activities as any[]).find((a: any) => a.id === act.id)
    if (!incoming) return act
    return { ...act, status: incoming.status, dayMarks: incoming.dayMarks }
  })
  data.activities = updated
  const ts = now()
  db.prepare('UPDATE plans SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), ts, req.params.id)
  res.json({ ok: true })
})

// ── Update approvals only (used by viewer for signatures + remarks) ───────────
app.post('/api/plans/:id/approve', (req, res) => {
  const { approvals } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  const oldApprovals = data.approvals ?? {}
  data.approvals = approvals
  const ts = now()

  // Determine required approval slots (optional dept manager)
  const requiresDeptManager = !!data.requiresDeptManager
  const requiredSlots = requiresDeptManager
    ? ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3']
    : ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
  const allNowApproved = requiredSlots.every((k: string) => !!approvals[k]?.signatureImage)

  if (allNowApproved && row.status === 'ongoing_approval') {
    data.status = 'published'
    data.publishedAt = ts
    db.prepare('UPDATE plans SET status = ?, published_at = ?, data = ?, updated_at = ? WHERE id = ?')
      .run('published', ts, JSON.stringify(data), ts, req.params.id)
  } else {
    db.prepare('UPDATE plans SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), ts, req.params.id)
  }
  res.json({ ok: true })

  // Detect newly signed slot and send sequential approval emails (best-effort)
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://10.164.16.18:1011'
  const viewLink = `${frontendOrigin}/view/${req.params.id}`
  const lastSlot = requiresDeptManager ? 'approvedBy3' : 'approvedBy2'
  const nextSlotMap: Record<string, string> = requiresDeptManager
    ? { reviewedBy: 'approvedBy1', approvedBy1: 'approvedBy2', approvedBy2: 'approvedBy3' }
    : { reviewedBy: 'approvedBy1', approvedBy1: 'approvedBy2' }
  const signingSlots = requiresDeptManager
    ? ['reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3'] as const
    : ['reviewedBy', 'approvedBy1', 'approvedBy2'] as const

  for (const key of signingSlots) {
    const wasUnsigned = !oldApprovals[key]?.signatureImage
    const isNowSigned  = !!approvals[key]?.signatureImage
    if (wasUnsigned && isNowSigned) {
      const nextKey = nextSlotMap[key as string]
      if (key !== lastSlot && nextKey && approvals[nextKey]?.name) {
        sendSlotApprovedEmail({
          planId: req.params.id,
          planTitle: data.title ?? '',
          itNumber: data.itNumber ?? '',
          viewLink,
          approvedSlot: { name: approvals[key].name, role: approvals[key].role },
          nextSlot: { name: approvals[nextKey].name, role: approvals[nextKey].role, email: approvals[nextKey].email ?? '' },
        }).catch(err => console.error('[mailer] slot-approved email failed:', err.message))
      } else if (key === lastSlot) {
        sendFullyApprovedEmail({
          planId: req.params.id,
          planTitle: data.title ?? '',
          itNumber: data.itNumber ?? '',
          viewLink,
          pic: { name: approvals.preparedBy?.name ?? '', email: approvals.preparedBy?.email ?? '' },
        }).catch(err => console.error('[mailer] fully-approved email failed:', err.message))
      }
      break
    }
  }
})

// ── Plan Updates (progress remarks) ──────────────────────────────────────────

app.get('/api/plans/:id/updates', (req, res) => {
  const rows = (db.prepare(
    'SELECT * FROM plan_updates WHERE plan_id = ? ORDER BY created_at ASC'
  ).all(req.params.id)) as any[]
  res.json(rows.map(r => ({
    id: r.id,
    planId: r.plan_id,
    author: r.author,
    message: r.message,
    activityId: r.activity_id || '',
    activityName: r.activity_name || '',
    createdAt: r.created_at,
  })))
})

app.post('/api/plans/:id/updates', (req, res) => {
  const row = db.prepare('SELECT status, data FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  const allApproved = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
    .every((k: string) => data.approvals?.[k]?.signatureImage)
  if (!allApproved) return res.status(403).json({ error: 'Updates only allowed on fully approved plans' })

  const { author, message, activityId, activityName } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' })
  const id = randomUUID()
  const ts = now()
  db.prepare(
    'INSERT INTO plan_updates (id, plan_id, author, message, activity_id, activity_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.id, author || 'Anonymous', message.trim(), activityId || '', activityName || '', ts)
  res.json({ id, createdAt: ts })
})

app.delete('/api/plans/:id/updates/:uid', (req, res) => {
  db.prepare('DELETE FROM plan_updates WHERE id = ? AND plan_id = ?')
    .run(req.params.uid, req.params.id)
  res.json({ ok: true })
})

// ── Activity Requests ─────────────────────────────────────────────────────────

app.get('/api/requests', (_req, res) => {
  const rows = (db.prepare(
    'SELECT * FROM activity_requests ORDER BY created_at DESC'
  ).all()) as any[]
  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    targetDate: r.target_date,
    itNumber: r.it_number,
    pic: r.pic,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
})

app.post('/api/requests', (req, res) => {
  const { title, description, targetDate, itNumber, pic, createdBy } = req.body
  const id = randomUUID()
  const ts = now()
  db.prepare(`
    INSERT INTO activity_requests (id, title, description, target_date, it_number, pic, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(id, title || '', description || '', targetDate || '', itNumber || '', pic || '', createdBy || '', ts, ts)
  res.json({ id })
})

app.put('/api/requests/:id', (req, res) => {
  const { title, description, targetDate, itNumber, pic, status, createdBy } = req.body
  const ts = now()
  db.prepare(`
    UPDATE activity_requests SET title = ?, description = ?, target_date = ?, it_number = ?, pic = ?, status = ?, created_by = ?, updated_at = ?
    WHERE id = ?
  `).run(title || '', description || '', targetDate || '', itNumber || '', pic || '', status || 'open', createdBy || '', ts, req.params.id)
  res.json({ ok: true })
})

app.delete('/api/requests/:id', (req, res) => {
  db.prepare('DELETE FROM activity_requests WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Company Holidays ──────────────────────────────────────────────────────────

app.get('/api/holidays', (_req, res) => {
  const rows = (db.prepare('SELECT * FROM company_holidays ORDER BY date ASC').all()) as any[]
  res.json(rows.map(r => ({ id: r.id, date: r.date, name: r.name, createdAt: r.created_at })))
})

app.post('/api/holidays', (req, res) => {
  const { date, name } = req.body
  if (!date) return res.status(400).json({ error: 'Date is required' })
  const id = randomUUID()
  const ts = now()
  db.prepare('INSERT INTO company_holidays (id, date, name, created_at) VALUES (?, ?, ?, ?)')
    .run(id, date, name || '', ts)
  res.json({ id })
})

app.delete('/api/holidays/:id', (req, res) => {
  db.prepare('DELETE FROM company_holidays WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Approvers (master list) ───────────────────────────────────────────────────

app.get('/api/approvers', (_req, res) => {
  const rows = db.prepare('SELECT * FROM approvers ORDER BY name ASC').all() as any[]
  res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, position: r.position, createdAt: r.created_at })))
})

app.post('/api/approvers', (req, res) => {
  const { name, email, position } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const id = randomUUID()
  db.prepare('INSERT INTO approvers (id, name, email, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), email?.trim() ?? '', position?.trim() ?? '', now())
  res.json({ id })
})

app.put('/api/approvers/:id', (req, res) => {
  const { name, email, position } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  db.prepare('UPDATE approvers SET name = ?, email = ?, position = ? WHERE id = ?')
    .run(name.trim(), email?.trim() ?? '', position?.trim() ?? '', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/approvers/:id', (req, res) => {
  db.prepare('DELETE FROM approvers WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Notifications (Power Automate polling) ────────────────────────────────────

app.get('/api/notifications/pending', (_req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE dispatched = 0 ORDER BY published_at ASC').all() as any[]
  res.json(rows.map(r => ({
    id: r.id, planId: r.plan_id, planTitle: r.plan_title,
    itNumber: r.it_number, planType: r.plan_type, viewLink: r.view_link,
    approvers: JSON.parse(r.approvers), publishedAt: r.published_at,
  })))
})

app.post('/api/notifications/:id/ack', (req, res) => {
  db.prepare('UPDATE notifications SET dispatched = 1, dispatched_at = ? WHERE id = ?')
    .run(now(), req.params.id)
  res.json({ ok: true })
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
app.listen(PORT, () => {
  console.log(`Activity Planning API server running on http://localhost:${PORT}`)
})
