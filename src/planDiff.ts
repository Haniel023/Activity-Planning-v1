import type { ActivityPlan } from './types'

export interface DiffSection {
  label: string
  changes: string[]
}

export function diffPlans(older: ActivityPlan, newer: ActivityPlan): DiffSection[] {
  const sections: DiffSection[] = []

  // ── Metadata ─────────────────────────────────────────────────────────────────
  const meta: string[] = []
  if (older.title !== newer.title)
    meta.push(`Title: "${older.title || '—'}" → "${newer.title || '—'}"`)
  if ((older.itNumber ?? '') !== (newer.itNumber ?? ''))
    meta.push(`IT Number: "${older.itNumber || '—'}" → "${newer.itNumber || '—'}"`)
  if ((older.targetDate ?? '') !== (newer.targetDate ?? ''))
    meta.push(`Target date: ${older.targetDate || '—'} → ${newer.targetDate || '—'}`)
  if ((older.groupType ?? '') !== (newer.groupType ?? ''))
    meta.push(`Group: ${older.groupType || '—'} → ${newer.groupType || '—'}`)
  if (meta.length) sections.push({ label: 'Plan Info', changes: meta })

  // ── Months ───────────────────────────────────────────────────────────────────
  const fmtMonth = (m: { year: number; month: number }) =>
    new Date(m.year, m.month, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
  const oldMonths = older.months.map(fmtMonth)
  const newMonths = newer.months.map(fmtMonth)
  const addedMonths = newMonths.filter(m => !oldMonths.includes(m))
  const removedMonths = oldMonths.filter(m => !newMonths.includes(m))
  const monthChanges: string[] = []
  if (addedMonths.length) monthChanges.push(`Months added: ${addedMonths.join(', ')}`)
  if (removedMonths.length) monthChanges.push(`Months removed: ${removedMonths.join(', ')}`)
  if (monthChanges.length) sections.push({ label: 'Schedule Months', changes: monthChanges })

  // ── Activities ───────────────────────────────────────────────────────────────
  const oldMap = new Map(older.activities.map(a => [a.id, a]))
  const newMap = new Map(newer.activities.map(a => [a.id, a]))

  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const [id, newA] of newMap) {
    const oldA = oldMap.get(id)
    if (!oldA) {
      added.push(`${newA.number} "${newA.name}"`)
      continue
    }
    const diffs: string[] = []
    if (oldA.name !== newA.name)
      diffs.push(`renamed "${oldA.name}" → "${newA.name}"`)
    if (oldA.mh !== newA.mh)
      diffs.push(`MH ${oldA.mh} → ${newA.mh}`)
    if ((oldA.hoursPerDay ?? 8) !== (newA.hoursPerDay ?? 8))
      diffs.push(`h/d ${oldA.hoursPerDay ?? 8} → ${newA.hoursPerDay ?? 8}`)
    if ((oldA.startDate ?? '') !== (newA.startDate ?? ''))
      diffs.push(`start date ${oldA.startDate || '—'} → ${newA.startDate || '—'}`)
    // Plan marks diff (schedule)
    const oldPlanDays = new Set(oldA.dayMarks.filter(m => m.plan).map(m => m.date))
    const newPlanDays = new Set(newA.dayMarks.filter(m => m.plan).map(m => m.date))
    const schedAdded = [...newPlanDays].filter(d => !oldPlanDays.has(d)).length
    const schedRemoved = [...oldPlanDays].filter(d => !newPlanDays.has(d)).length
    if (schedAdded || schedRemoved)
      diffs.push(`schedule: +${schedAdded} days, −${schedRemoved} days`)
    if (diffs.length)
      modified.push(`${newA.number} "${newA.name}": ${diffs.join('; ')}`)
  }

  for (const [id, oldA] of oldMap) {
    if (!newMap.has(id)) removed.push(`${oldA.number} "${oldA.name}"`)
  }

  if (added.length) sections.push({ label: 'Activities Added', changes: added })
  if (removed.length) sections.push({ label: 'Activities Removed', changes: removed })
  if (modified.length) sections.push({ label: 'Activities Modified', changes: modified })

  // ── Approvers / stakeholders ─────────────────────────────────────────────────
  const oldStake = (older.stakeholders ?? []).map(s => s.name).sort().join(', ')
  const newStake = (newer.stakeholders ?? []).map(s => s.name).sort().join(', ')
  if (oldStake !== newStake)
    sections.push({ label: 'Stakeholders', changes: [`Changed: ${oldStake || '—'} → ${newStake || '—'}`] })

  if (sections.length === 0)
    sections.push({ label: 'No changes detected', changes: [] })

  return sections
}
