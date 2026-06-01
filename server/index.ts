import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { db } from './db.js'

const app = express()
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '20mb' }))

const now = () => new Date().toISOString()

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
  if (row.status === 'published') {
    return res.status(403).json({ error: 'Published plan cannot be modified by PIC' })
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

// ── Publish plan (PIC locks it) ───────────────────────────────────────────────
app.post('/api/plans/:id/publish', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const ts = now()
  const data = JSON.parse(row.data)
  data.status = 'published'
  data.publishedAt = ts
  db.prepare(`
    UPDATE plans SET status = 'published', published_at = ?, data = ?, updated_at = ? WHERE id = ?
  `).run(ts, JSON.stringify(data), ts, req.params.id)
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
  res.json({ ok: true, newVersion })
})

// ── Re-publish after revision (version bumps again) ───────────────────────────
app.post('/api/plans/:id/republish', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  if (row.status !== 'for_revision') {
    return res.status(400).json({ error: 'Plan is not in for_revision state' })
  }
  const data = JSON.parse(row.data)
  const newVersion = bumpVersion(row.version)
  const ts = now()
  data.status = 'published'
  data.documentVersion = newVersion
  data.publishedAt = ts
  data.versionHistory = [
    ...(data.versionHistory || []),
    { version: newVersion, date: new Date().toISOString().slice(0, 10), reason: 'Re-published after revision', by: req.body.by || '' },
  ]
  db.prepare(`
    UPDATE plans SET status = 'published', version = ?, published_at = ?, data = ?, updated_at = ? WHERE id = ?
  `).run(newVersion, ts, JSON.stringify(data), ts, req.params.id)
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
  res.json({ ok: true, newVersion })
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
})

// ── Save progress (actual marks + status) when plan is published & fully approved ──
app.post('/api/plans/:id/save-progress', (req, res) => {
  const { activities } = req.body
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Plan not found' })
  const data = JSON.parse(row.data)
  const allApproved = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
    .every((k: string) => data.approvals?.[k]?.signatureImage)
  if (row.status !== 'published' || !allApproved) {
    return res.status(403).json({ error: 'Progress save only allowed when fully approved' })
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
  data.approvals = approvals
  const ts = now()
  db.prepare('UPDATE plans SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), ts, req.params.id)
  res.json({ ok: true })
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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
app.listen(PORT, () => {
  console.log(`Activity Planning API server running on http://localhost:${PORT}`)
})
