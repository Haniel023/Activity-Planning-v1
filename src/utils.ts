import type { ActivityRow, ActivityPlan, MonthConfig, PlanType, DevPersons, SupportPersons, SelfCheckTR, DayMark, PICEntry } from './types'
import { SELF_CHECK_DEFAULTS } from './types'

export function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export function monthLabel(m: MonthConfig) {
  return new Date(m.year, m.month, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Use explicit local-date construction to avoid any DST / UTC edge cases
export function isWeekend(dateStr: string): boolean {
  const parts = dateStr.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1  // 0-indexed
  const d = parseInt(parts[2], 10)
  const dow = new Date(y, m, d).getDay()   // 0=Sun 1=Mon … 5=Fri 6=Sat
  return dow === 0 || dow === 6
}

export function dayOfWeekAbbr(dateStr: string): string {
  const parts = dateStr.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  const dow = new Date(y, m, d).getDay()
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dow]
}

export function dayNumber(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10)
}

export function generateDayMarks(months: MonthConfig[]): DayMark[] {
  const marks: DayMark[] = []
  for (const m of months) {
    const days = daysInMonth(m.year, m.month)
    for (let d = 1; d <= days; d++) {
      marks.push({ date: toDateStr(m.year, m.month, d), plan: false, actual: false })
    }
  }
  return marks
}

export function syncDayMarks(existing: DayMark[], newMonths: MonthConfig[]): DayMark[] {
  const existingMap = new Map(existing.map(m => [m.date, m]))
  return generateDayMarks(newMonths).map(m => existingMap.get(m.date) ?? m)
}

export function makePICEntry(pic = ''): PICEntry {
  return { id: generateId(), pic, raci: { r: false, a: false, c: false, i: false } }
}

// ── Auto-numbering helpers ───────────────────────────────────────────────────

export function getNextPhaseNumber(activities: ActivityRow[]): string {
  const nums = activities
    .filter(a => a.isPhase)
    .map(a => parseInt(a.number.split('.')[0], 10))
    .filter(n => !isNaN(n) && n > 0)
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${max + 1}.0`
}

export function getNextSubNumber(activities: ActivityRow[], afterIdx: number): string {
  // Walk backwards from afterIdx to find the enclosing phase number
  let phaseNum = 1
  for (let i = afterIdx; i >= 0; i--) {
    if (activities[i]?.isPhase) {
      const n = parseInt(activities[i].number.split('.')[0], 10)
      if (!isNaN(n) && n > 0) { phaseNum = n; break }
    }
  }
  // Highest sub-number across ALL activities in this phase (avoids conflicts)
  const prefix = `${phaseNum}.`
  const subs = activities
    .filter(a => !a.isPhase && a.number.startsWith(prefix))
    .map(a => {
      const parts = a.number.split('.')
      return parts.length > 1 ? parseInt(parts[1], 10) : 0
    })
    .filter(n => !isNaN(n))
  const maxSub = subs.length > 0 ? Math.max(...subs) : 0
  return `${phaseNum}.${maxSub + 1}`
}

// ── Person roles for PIC datalist ────────────────────────────────────────────

export function getPersonRoles(type: PlanType): string[] {
  return type === 'development'
    ? ['Requestor', 'Designer', 'Developer', 'SE', 'PM', 'Manager']
    : ['Requestor', 'SMART Member', 'SE', 'PM', 'Manager']
}

// ── Plan creation ─────────────────────────────────────────────────────────────

function makeRow(number: string, name: string, isPhase: boolean, months: MonthConfig[]): ActivityRow {
  return {
    id: generateId(), number, name, isPhase,
    picEntries: [makePICEntry()],
    status: 'NOT YET STARTED', progress: 0, mh: 0, workingDays: 0,
    dayMarks: generateDayMarks(months),
  }
}

function defaultMonths(): MonthConfig[] {
  const now = new Date()
  const months: MonthConfig[] = []
  for (let i = 0; i < 3; i++) {
    const totalMonth = now.getMonth() + i
    months.push({ year: now.getFullYear() + Math.floor(totalMonth / 12), month: totalMonth % 12 })
  }
  return months
}

export function createDefaultPlan(type: PlanType): ActivityPlan {
  const months = defaultMonths()

  const devActivities: ActivityRow[] = [
    makeRow('1.0', 'Preparation', true, months),
    makeRow('1.1', 'Specs Discussion', false, months),
    makeRow('1.2', 'Activity Plan Creation', false, months),
    makeRow('1.3', 'RA', false, months),
    makeRow('2.0', 'Design', true, months),
    makeRow('2.1', 'RD', false, months),
    makeRow('3.0', 'Development', true, months),
    makeRow('3.1', 'Function 1', false, months),
    makeRow('4.0', 'Testing', true, months),
    makeRow('4.1', 'PG Test', false, months),
    makeRow('4.2', 'SE Test', false, months),
    makeRow('5.0', 'Implementation', true, months),
    makeRow('5.1', 'Release', false, months),
  ]

  const supportActivities: ActivityRow[] = [
    makeRow('1.0', 'Preparation', true, months),
    makeRow('1.1', 'Request Discussion', false, months),
    makeRow('2.0', 'Investigation', true, months),
    makeRow('2.1', 'Problem 1', false, months),
    makeRow('3.0', 'Fixing', true, months),
    makeRow('3.1', 'Fix', false, months),
    makeRow('4.0', 'Documentation', true, months),
    makeRow('4.1', 'Analysis Creation', false, months),
    makeRow('5.0', 'Cascading', true, months),
    makeRow('5.1', 'Cascading', false, months),
  ]

  const devPersons: DevPersons = { requestor: '', designer: '', developer: '', se: '', pm: '' }
  const supportPersons: SupportPersons = { requestor: '', smartMember: '', se: '', pm: '' }

  return {
    type,
    title: '',
    documentVersion: '1.00',
    persons: type === 'development' ? devPersons : supportPersons,
    approvals: {
      preparedBy: { name: '', role: 'PIC' },
      reviewedBy: { name: '', role: 'PROJECT LEADER' },
      approvedBy1: { name: '', role: 'SUPERVISOR' },
      approvedBy2: { name: '', role: 'MANAGER' },
      remarks: '',
    },
    activities: type === 'development' ? devActivities : supportActivities,
    months,
    otDays: [],
  }
}

export function createDefaultSelfCheck(): SelfCheckTR {
  return {
    selfCheckPIC: '',
    trPIC: '',
    items: SELF_CHECK_DEFAULTS.map(i => ({ ...i })),
    versionHistory: [{ version: '1.00', reason: 'N/A', date: new Date().toISOString().slice(0, 10), updatedBy: '' }],
  }
}

// ── Progress / status calculation ─────────────────────────────────────────────

export interface PlanStatus {
  label: 'COMPLETE' | 'ON TIME' | 'AT RISK' | 'DELAYED' | 'NOT STARTED'
  progress: number       // 0-100
  daysLeft: number | null
  expectedProgress: number
}

export function calcPlanStatus(plan: ActivityPlan): PlanStatus {
  const nonPhase = plan.activities.filter(a => !a.isPhase)
  const totalMH = nonPhase.reduce((s, a) => s + a.mh, 0)
  const doneMH = nonPhase.filter(a => a.status === 'DONE').reduce((s, a) => s + a.mh, 0)
  const ongoingMH = nonPhase.filter(a => a.status === 'ONGOING').reduce((s, a) => s + a.mh, 0)
  const progress = totalMH > 0 ? ((doneMH + ongoingMH * 0.5) / totalMH) * 100 : 0

  if (progress >= 100) return { label: 'COMPLETE', progress: 100, daysLeft: 0, expectedProgress: 100 }

  if (!plan.targetDate) return { label: 'NOT STARTED', progress, daysLeft: null, expectedProgress: 0 }

  const todayMs = Date.now()
  const targetMs = new Date(plan.targetDate).getTime()
  const startMs = plan.months.length > 0
    ? new Date(plan.months[0].year, plan.months[0].month, 1).getTime()
    : todayMs
  const totalMs = targetMs - startMs
  const elapsedMs = todayMs - startMs
  const expectedProgress = totalMs > 0 ? Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100) : 0
  const daysLeft = Math.ceil((targetMs - todayMs) / 86400000)

  if (daysLeft < 0) return { label: 'DELAYED', progress, daysLeft, expectedProgress }
  if (progress >= expectedProgress - 5) return { label: 'ON TIME', progress, daysLeft, expectedProgress }
  if (progress >= expectedProgress - 20) return { label: 'AT RISK', progress, daysLeft, expectedProgress }
  return { label: 'DELAYED', progress, daysLeft, expectedProgress }
}

export const STATUS_OPTIONS = ['NOT YET STARTED', 'ONGOING', 'DONE', 'ON HOLD'] as const
export const CHECK_OPTIONS = ['', 'OK', 'NG', 'N/A'] as const
