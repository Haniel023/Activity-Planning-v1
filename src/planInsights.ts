import type { ActivityPlan, ActivityRow, CompanyHoliday } from './types'
import { isWeekend } from './utils'
import { isHoliday } from './holidays'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityInsightStatus =
  | 'not_started' | 'done' | 'on_hold'
  | 'ahead' | 'on_track' | 'at_risk' | 'behind'

export type PredictionLabel = 'too_early' | 'ahead' | 'on_track' | 'at_risk' | 'delayed'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface ActivityInsight {
  activityId: string
  activityNumber: string
  activityName: string
  status: ActivityInsightStatus
  pastPlanDays: number
  pastActualDays: number
  totalPlanDays: number
  futurePlanDays: number
  remainingWorkDays: number
  missedDays: number
  extraDaysNeeded: number
  burnRate: number
}

export interface RecoveryOption {
  type: 'overtime' | 'hours_increase' | 'scope_note'
  label: string
  detail: string
  gain?: number
}

export interface PlanInsight {
  label: PredictionLabel
  confidence: ConfidenceLevel
  overallBurnRate: number
  totalPastPlanDays: number
  totalAllPlanDays: number
  projectedFinishDate: string | null
  targetDate: string | null
  daysVariance: number
  totalExtraDaysNeeded: number
  activitiesAtRisk: ActivityInsight[]
  recoveryOptions: RecoveryOption[]
  activityInsights: ActivityInsight[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonWorkingDay(date: string, companyHolidaySet: Set<string>, otSet: Set<string>): boolean {
  return isHoliday(date)
    || companyHolidaySet.has(date)
    || (isWeekend(date) && !otSet.has(date))
}

function addWorkingDays(
  fromDate: string,
  n: number,
  companyHolidaySet: Set<string>,
  otSet: Set<string>,
): string {
  if (n <= 0) return fromDate
  const dt = new Date(fromDate + 'T00:00:00')
  let added = 0
  let guard = 0
  while (added < n && guard < 365) {
    dt.setDate(dt.getDate() + 1)
    guard++
    const d = dt.toISOString().slice(0, 10)
    if (!isNonWorkingDay(d, companyHolidaySet, otSet)) added++
  }
  return dt.toISOString().slice(0, 10)
}

function calendarDayDiff(dateA: string, dateB: string): number {
  // Returns dateB - dateA in calendar days (positive if B is after A)
  return Math.round(
    (new Date(dateB + 'T00:00:00').getTime() - new Date(dateA + 'T00:00:00').getTime())
    / (1000 * 60 * 60 * 24)
  )
}

// ── Per-activity insight ───────────────────────────────────────────────────────

function assessActivity(row: ActivityRow, today: string): ActivityInsight | null {
  if (row.isPhase) return null

  // Use strict < today for plan days so today's scheduled work isn't penalised yet.
  // Actual marks use <= today so work done today is credited immediately.
  const pastPlanDays   = row.dayMarks.filter(m => m.plan   && m.date <  today).length
  const pastActualDays = row.dayMarks.filter(m => m.actual && m.date <= today).length
  const totalPlanDays  = row.dayMarks.filter(m => m.plan).length
  const futurePlanDays = row.dayMarks.filter(m => m.plan   && m.date >= today).length

  if (totalPlanDays === 0) return null  // no schedule → skip

  const burnRate          = pastPlanDays > 0 ? pastActualDays / pastPlanDays : 1.0
  const missedDays        = Math.max(0, pastPlanDays - pastActualDays)
  const remainingWorkDays = Math.max(0, totalPlanDays - pastActualDays)
  const extraDaysNeeded   = Math.max(0, remainingWorkDays - futurePlanDays)

  let status: ActivityInsightStatus
  if (row.status === 'DONE')    { status = 'done' }
  else if (row.status === 'ON HOLD') { status = 'on_hold' }
  else if (pastPlanDays === 0)  { status = 'not_started' }
  else if (extraDaysNeeded > 0) { status = 'behind' }
  else if (burnRate >= 1.05)    { status = 'ahead' }
  else if (burnRate >= 0.95)    { status = 'on_track' }
  else if (burnRate >= 0.80)    { status = 'at_risk' }
  else                          { status = 'behind' }

  return {
    activityId: row.id,
    activityNumber: row.number,
    activityName: row.name,
    status,
    pastPlanDays, pastActualDays, totalPlanDays,
    futurePlanDays, remainingWorkDays,
    missedDays, extraDaysNeeded, burnRate,
  }
}

// ── Recovery options ──────────────────────────────────────────────────────────

function buildRecoveryOptions(
  totalExtraDaysNeeded: number,
  daysVariance: number,
  overallBurnRate: number,
  insights: ActivityInsight[],
  lastPlanDate: string,
  companyHolidaySet: Set<string>,
  otSet: Set<string>,
): RecoveryOption[] {
  const options: RecoveryOption[] = []
  const today = new Date().toISOString().slice(0, 10)

  // Option A — OT weekends
  if (lastPlanDate > today) {
    const remainingWeekendDays: string[] = []
    const dt = new Date(today + 'T00:00:00')
    let guard = 0
    while (dt.toISOString().slice(0, 10) <= lastPlanDate && guard < 400) {
      dt.setDate(dt.getDate() + 1)
      guard++
      const d = dt.toISOString().slice(0, 10)
      if (isWeekend(d) && !otSet.has(d) && !isHoliday(d) && !companyHolidaySet.has(d)) {
        remainingWeekendDays.push(d)
      }
    }
    const availableWeekendDays = remainingWeekendDays.length
    if (availableWeekendDays > 0) {
      const weekendsNeeded = Math.ceil(totalExtraDaysNeeded / 2)
      const weekendsUsed   = Math.min(weekendsNeeded, Math.floor(availableWeekendDays / 2))
      const gainDays       = weekendsUsed * 2
      options.push({
        type: 'overtime',
        label: 'Mark OT Weekends',
        detail: `${Math.floor(availableWeekendDays / 2)} weekend(s) available in remaining schedule. Marking ${weekendsUsed} weekend(s) as OT recovers ~${gainDays} working day(s).`,
        gain: gainDays,
      })
    }
  }

  // Option B — Increase h/d
  const affectedRows = insights.filter(a => (a.status === 'behind' || a.status === 'at_risk') && a.missedDays > 0)
  if (affectedRows.length > 0) {
    let totalDaysRecoverable = 0
    for (const a of affectedRows) {
      const missedMH = a.missedDays * 8
      const daysAt10 = Math.floor(missedMH / 10)
      totalDaysRecoverable += Math.max(0, a.missedDays - daysAt10)
    }
    if (totalDaysRecoverable > 0) {
      options.push({
        type: 'hours_increase',
        label: 'Increase Hours/Day',
        detail: `Raising h/d from 8 to 10 across ${affectedRows.length} affected activit${affectedRows.length === 1 ? 'y' : 'ies'} could recover ~${totalDaysRecoverable} day(s) of deficit.`,
        gain: totalDaysRecoverable,
      })
    }
  }

  // Option C — Scope note (always)
  const lateness = Math.abs(daysVariance)
  const burnPct  = Math.round(overallBurnRate * 100)
  options.push({
    type: 'scope_note',
    label: 'Review Scope',
    detail: daysVariance < 0
      ? `At ${burnPct}% efficiency, finishing ~${lateness} day(s) late. Consider reprioritizing or deferring lower-priority activities.`
      : `At ${burnPct}% efficiency. Reviewing scope can prevent future slippage.`,
  })

  return options
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function computeInsights(plan: ActivityPlan, companyHolidays: CompanyHoliday[]): PlanInsight {
  const today              = new Date().toISOString().slice(0, 10)
  const otSet              = new Set(plan.otDays ?? [])
  const companyHolidaySet  = new Set(companyHolidays.map(h => h.date))

  // ── Per-activity ───────────────────────────────────────────────────────────
  const activityInsights: ActivityInsight[] = []
  for (const row of plan.activities) {
    const a = assessActivity(row, today)
    if (a) activityInsights.push(a)
  }

  // ── Aggregation (exclude done/on_hold from burn rate) ─────────────────────
  let weightedBurnSum = 0
  let weightSum       = 0
  let totalPastPlan   = 0
  let totalAllPlan    = 0
  let totalExtra      = 0

  for (const a of activityInsights.filter(a => a.status !== 'done' && a.status !== 'on_hold')) {
    const row   = plan.activities.find(r => r.id === a.activityId)
    const weight = (row?.mh ?? 0) > 0 ? (row!.mh) : a.totalPlanDays
    if (a.pastPlanDays > 0) {
      weightedBurnSum += weight * a.burnRate
      weightSum       += weight
    }
    totalPastPlan += a.pastPlanDays
    totalAllPlan  += a.totalPlanDays
    totalExtra    += a.extraDaysNeeded
  }

  const overallBurnRate = weightSum > 0 ? weightedBurnSum / weightSum : 1.0

  // ── Confidence ─────────────────────────────────────────────────────────────
  const confidenceRatio = totalAllPlan > 0 ? totalPastPlan / totalAllPlan : 0
  const confidence: ConfidenceLevel =
    confidenceRatio < 0.20 ? 'low' :
    confidenceRatio < 0.60 ? 'medium' : 'high'

  // ── Prediction label ───────────────────────────────────────────────────────
  let label: PredictionLabel
  if (totalPastPlan === 0)        label = 'too_early'
  else if (overallBurnRate >= 1.05) label = 'ahead'
  else if (overallBurnRate >= 0.95) label = 'on_track'
  else if (overallBurnRate >= 0.80) label = 'at_risk'
  else                              label = 'delayed'

  // ── Projected finish date ──────────────────────────────────────────────────
  // Find last plan-marked date across ALL non-phase activities (including done)
  let lastPlanDate: string | null = null
  for (const row of plan.activities) {
    if (row.isPhase) continue
    for (const m of row.dayMarks) {
      if (m.plan && (!lastPlanDate || m.date > lastPlanDate)) lastPlanDate = m.date
    }
  }

  let projectedFinishDate: string | null = null
  if (lastPlanDate) {
    projectedFinishDate = totalExtra > 0
      ? addWorkingDays(lastPlanDate, totalExtra, companyHolidaySet, otSet)
      : lastPlanDate
  }

  // ── Days variance vs target ────────────────────────────────────────────────
  const targetDate   = plan.targetDate ?? null
  const daysVariance = (targetDate && projectedFinishDate)
    ? calendarDayDiff(projectedFinishDate, targetDate)   // positive = finish early
    : 0

  // ── Activities needing attention ───────────────────────────────────────────
  const activitiesAtRisk = activityInsights.filter(
    a => a.status === 'at_risk' || a.status === 'behind'
  )

  // ── Recovery options ───────────────────────────────────────────────────────
  const recoveryOptions = (label === 'at_risk' || label === 'delayed')
    ? buildRecoveryOptions(
        totalExtra, daysVariance, overallBurnRate,
        activityInsights, lastPlanDate ?? today,
        companyHolidaySet, otSet,
      )
    : []

  return {
    label, confidence, overallBurnRate,
    totalPastPlanDays: totalPastPlan,
    totalAllPlanDays: totalAllPlan,
    projectedFinishDate, targetDate,
    daysVariance,
    totalExtraDaysNeeded: totalExtra,
    activitiesAtRisk, recoveryOptions,
    activityInsights,
  }
}
