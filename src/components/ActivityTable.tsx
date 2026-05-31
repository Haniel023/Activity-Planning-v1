import { useMemo, useState, useRef, useEffect } from 'react'
import type { ActivityPlan, ActivityRow, MonthConfig, PICEntry, RACI } from '../types'
import {
  generateId, generateDayMarks, isWeekend, dayOfWeekAbbr, dayNumber,
  daysInMonth, toDateStr, monthLabel, STATUS_OPTIONS, makePICEntry,
  getNextPhaseNumber, getNextSubNumber, getPersonRoles, calcAutoProgress,
} from '../utils'

// Auto-sizing textarea — expands vertically as text wraps
function AutoTextarea({ value, onChange, className, disabled }: {
  value: string; onChange?: (v: string) => void; className: string; disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      style={{ resize: 'none', overflow: 'hidden' }}
      value={value}
      disabled={disabled}
      onChange={e => onChange?.(e.target.value)}
    />
  )
}

type ViewMode = 'daily' | 'weekly'

interface WeekGroup { monthLabel: string; weekLabel: string; dates: string[] }

function buildWeekGroups(months: MonthConfig[]): WeekGroup[] {
  const groups: WeekGroup[] = []
  for (const m of months) {
    const total = daysInMonth(m.year, m.month)
    const lbl = monthLabel(m)
    const ranges: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, total]]
    ranges.forEach(([start, end], wi) => {
      const dates: string[] = []
      for (let d = start; d <= Math.min(end, total); d++) dates.push(toDateStr(m.year, m.month, d))
      if (dates.length > 0) groups.push({ monthLabel: lbl, weekLabel: `W${wi + 1}`, dates })
    })
  }
  return groups
}

// Uniform border for all calendar body cells — no width variation to avoid border-collapse artifacts.
function dayCellBorder(_date: string): string {
  return 'border border-gray-200'
}

const STATUS_SHORT: Record<string, string> = {
  'NOT YET STARTED': 'Not Yet', 'ONGOING': 'Ongoing', 'DONE': 'Done', 'ON HOLD': 'On Hold',
}
const STATUS_COLOR: Record<string, string> = {
  'NOT YET STARTED': 'text-gray-500', 'ONGOING': 'text-blue-600', 'DONE': 'text-green-600', 'ON HOLD': 'text-amber-600',
}

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
  readOnly?: boolean
  partialEdit?: boolean   // all approvals done: only actual marks + status are editable
}

export default function ActivityTable({ plan, onChange, readOnly, partialEdit }: Props) {
  const { activities, months, otDays } = plan
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [showRaciInfo, setShowRaciInfo] = useState(false)

  const allDays = useMemo(() => {
    const days: string[] = []
    for (const m of months) {
      const cnt = daysInMonth(m.year, m.month)
      for (let d = 1; d <= cnt; d++) days.push(toDateStr(m.year, m.month, d))
    }
    return days
  }, [months])

  const weekGroups = useMemo(() => buildWeekGroups(months), [months])
  const monthGroups = useMemo(() =>
    months.map(m => ({ label: monthLabel(m), span: viewMode === 'daily' ? daysInMonth(m.year, m.month) : 4 })),
    [months, viewMode]
  )
  const otSet = useMemo(() => new Set(otDays), [otDays])
  const personRoles = useMemo(() => getPersonRoles(plan.type), [plan.type])

  function updateActivities(next: ActivityRow[]) { onChange({ ...plan, activities: next }) }
  function updateRow(id: string, changes: Partial<ActivityRow>) {
    updateActivities(activities.map(a => a.id === id ? { ...a, ...changes } : a))
  }

  function addRow(afterId: string, isPhase: boolean) {
    const idx = activities.findIndex(a => a.id === afterId)
    const number = isPhase ? getNextPhaseNumber(activities) : getNextSubNumber(activities, idx)
    const newRow: ActivityRow = {
      id: generateId(), number, name: '', isPhase,
      picEntries: [makePICEntry()],
      status: 'NOT YET STARTED', progress: 0, autoProgress: true, mh: 0, workingDays: 0,
      dayMarks: generateDayMarks(months),
    }
    const next = [...activities]; next.splice(idx + 1, 0, newRow)
    updateActivities(next)
  }

  function deleteRow(id: string) { updateActivities(activities.filter(a => a.id !== id)) }

  function addPICEntry(rowId: string) {
    const row = activities.find(a => a.id === rowId)
    if (!row) return
    updateRow(rowId, { picEntries: [...row.picEntries, makePICEntry()] })
  }
  function deletePICEntry(rowId: string, entryId: string) {
    const row = activities.find(a => a.id === rowId)
    if (!row || row.picEntries.length <= 1) return
    updateRow(rowId, { picEntries: row.picEntries.filter(e => e.id !== entryId) })
  }
  function updatePICEntry(rowId: string, entryId: string, changes: Partial<PICEntry>) {
    const row = activities.find(a => a.id === rowId)
    if (!row) return
    updateRow(rowId, { picEntries: row.picEntries.map(e => e.id === entryId ? { ...e, ...changes } : e) })
  }

  // Count plan-marked days and auto-update workingDays
  function toggleDay(rowId: string, date: string, type: 'plan' | 'actual') {
    updateActivities(activities.map(a => {
      if (a.id !== rowId) return a
      const exists = a.dayMarks.find(m => m.date === date)
      const newMarks = exists
        ? a.dayMarks.map(m => m.date === date ? { ...m, [type]: !m[type] } : m)
        : [...a.dayMarks, { date, plan: type === 'plan', actual: type === 'actual' }]
      const workingDays = type === 'plan' ? newMarks.filter(m => m.plan).length : a.workingDays
      return { ...a, dayMarks: newMarks, workingDays }
    }))
  }

  function toggleWeekGroup(rowId: string, weekDates: string[], type: 'plan' | 'actual') {
    const row = activities.find(a => a.id === rowId)
    if (!row) return
    const mm = new Map(row.dayMarks.map(m => [m.date, m]))
    const anyMarked = weekDates.some(d => type === 'plan' ? mm.get(d)?.plan : mm.get(d)?.actual)
    const togglable = new Set(weekDates.filter(d => !isWeekend(d) || otSet.has(d)))
    updateActivities(activities.map(a => {
      if (a.id !== rowId) return a
      const newMarks = a.dayMarks.map(m => togglable.has(m.date) ? { ...m, [type]: !anyMarked } : m)
      const workingDays = type === 'plan' ? newMarks.filter(m => m.plan).length : a.workingDays
      return { ...a, dayMarks: newMarks, workingDays }
    }))
  }

  function toggleOTDay(date: string) {
    onChange({ ...plan, otDays: otSet.has(date) ? plan.otDays.filter(d => d !== date) : [...plan.otDays, date] })
  }

  const nonPhase = activities.filter(a => !a.isPhase)
  const totalMH = nonPhase.reduce((s, a) => s + a.mh, 0)
  const doneMH = nonPhase.filter(a => a.status === 'DONE').reduce((s, a) => s + a.mh, 0)
  const ongoingMH = nonPhase.filter(a => a.status === 'ONGOING').reduce((s, a) => s + a.mh, 0)
  const progress = totalMH > 0 ? ((doneMH + ongoingMH * 0.5) / totalMH) * 100 : 0

  const addLast = (isPhase: boolean) => {
    const lastId = activities[activities.length - 1]?.id
    const lastIdx = activities.length - 1
    const number = isPhase ? getNextPhaseNumber(activities) : getNextSubNumber(activities, lastIdx)
    if (lastId) {
      addRow(lastId, isPhase)
    } else {
      updateActivities([{
        id: generateId(), number, name: '', isPhase,
        picEntries: [makePICEntry()], status: 'NOT YET STARTED', progress: 0, mh: 0, workingDays: 0,
        dayMarks: generateDayMarks(months),
      }])
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* RACI info modal */}
      {showRaciInfo && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRaciInfo(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">RACI Meaning</h2>
              <button onClick={() => setShowRaciInfo(false)} className="text-gray-300 hover:text-gray-500 text-lg leading-none">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { letter: 'R', name: 'Responsible', desc: 'The person who performs the work.' },
                { letter: 'A', name: 'Accountable', desc: 'The person ultimately accountable for the work or decision being made.' },
                { letter: 'C', name: 'Consulted',   desc: 'Anyone who must be consulted with prior to a decision being made and/or the task being completed.' },
                { letter: 'I', name: 'Informed',    desc: 'Anyone who must be informed when a decision is made or work is completed.' },
              ].map(({ letter, name, desc }) => (
                <div key={letter} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{letter}</span>
                  <p className="text-gray-600 text-xs leading-relaxed">
                    <span className="font-semibold text-gray-800">{name}</span> — {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">Activity Plan</h2>
          <div className="flex border border-gray-200 rounded overflow-hidden text-xs">
            <button className={`px-2.5 py-1 transition-colors ${viewMode === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setViewMode('weekly')}>Weekly</button>
            <button className={`px-2.5 py-1 transition-colors ${viewMode === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setViewMode('daily')}>Daily</button>
          </div>
          {!readOnly && !partialEdit && <button onClick={() => addLast(true)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded">+ Phase</button>}
          {!readOnly && !partialEdit && <button onClick={() => addLast(false)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded">+ Activity</button>}
          {partialEdit && <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200">Fully Approved — editing actual & status only</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
          <span><span className="text-blue-600 font-bold">○</span> Plan &nbsp;<span className="text-orange-500 font-bold">●</span> Actual</span>
          {viewMode === 'daily' && <span className="hidden lg:inline">Click <span className="font-medium text-gray-500">Sa/Su</span> header → <span className="text-amber-600 font-semibold">OT</span></span>}
          {viewMode === 'weekly' && <span className="hidden lg:inline">Click week = mark all weekdays · Days auto-count</span>}
          <span className="font-medium text-gray-600">MH: {totalMH.toFixed(1)} | {progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50">
              <th className="border border-gray-200 px-1 py-1.5 text-center bg-gray-100 text-gray-600 w-8 sticky left-0 z-20">#</th>
              <th className="border border-gray-200 px-2 py-1.5 text-left bg-gray-100 text-gray-600 min-w-44 sticky left-8 z-20">Activity</th>
              <th className="border border-gray-200 px-1 py-1.5 text-center bg-gray-100 text-gray-600 w-20">PIC</th>
              <th className="border border-gray-200 px-0 py-1.5 text-center bg-gray-100 text-gray-600 w-20" colSpan={4}>
                <span className="inline-flex items-center gap-1">
                  <span className="text-[10px]">Responsibility</span>
                  <button
                    type="button"
                    onClick={() => setShowRaciInfo(true)}
                    className="w-3.5 h-3.5 rounded-full bg-blue-200 text-blue-700 text-[9px] font-bold leading-none flex items-center justify-center hover:bg-blue-300 transition-colors"
                    title="RACI meaning"
                  >i</button>
                </span>
              </th>
              <th className="border border-gray-200 px-1 py-1.5 text-center bg-gray-100 text-gray-600 w-16">Status</th>
              <th className="border border-gray-200 px-0 py-1.5 text-center bg-gray-100 text-gray-600 w-8">%</th>
              <th className="border border-gray-200 px-0 py-1.5 text-center bg-gray-100 text-gray-600 w-10">MH</th>
              <th className="border border-gray-200 px-0 py-1.5 text-center bg-gray-100 text-gray-600 w-8 whitespace-nowrap" title="Auto-counted from Plan marks">Days</th>
              <th className="border border-gray-200 px-0 py-1.5 text-center bg-gray-100 text-gray-600 w-10">Sched.</th>
              {monthGroups.map(({ label, span }) => (
                <th key={label} colSpan={span} className="border border-gray-200 px-1 py-1.5 text-center bg-blue-50 text-blue-700 font-semibold whitespace-nowrap">{label}</th>
              ))}
              <th className="border border-gray-200 px-1 py-1.5 text-center bg-gray-100 text-gray-600 w-12">Act.</th>
            </tr>
            {/* Sub-header: RACI labels + day/week cols */}
            <tr className="bg-gray-50">
              <th className="border border-gray-200 bg-gray-100 sticky left-0 z-20" />
              <th className="border border-gray-200 bg-gray-100 sticky left-8 z-20" />
              <th className="border border-gray-200 bg-gray-100" />
              {(['R','A','C','I'] as const).map(l => (
                <th key={l} className="border border-gray-200 bg-gray-100 text-gray-500 text-center w-5 font-semibold">{l}</th>
              ))}
              {Array.from({ length: 5 }).map((_, i) => <th key={i} className="border border-gray-200 bg-gray-100" />)}
              {viewMode === 'daily'
                ? allDays.map(date => {
                    const wknd = isWeekend(date); const isOT = otSet.has(date)
                    // Weekday cells: bg-white (clearly distinct from weekend bg-gray-200)
                    return (
                      <th key={date}
                        className={[
                          'border border-gray-200 text-center w-6 px-0 select-none',
                          wknd
                            ? isOT
                              ? 'bg-amber-100 cursor-pointer hover:bg-amber-200'
                              : 'bg-gray-300 cursor-pointer hover:bg-gray-400'
                            : dayNumber(date) === 1
                              ? 'bg-blue-100'   // first day of month — clear visual marker
                              : 'bg-gray-50',
                        ].join(' ')}
                        onClick={wknd && !readOnly && !partialEdit ? () => toggleOTDay(date) : undefined}
                        title={wknd ? (isOT ? `${date} — OT enabled (click to disable)` : `${date} — Weekend (click to enable OT)`) : date}
                      >
                        <div className={`text-[9px] leading-tight font-medium ${wknd ? (isOT ? 'text-amber-700' : 'text-gray-500') : dayNumber(date) === 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                          {dayOfWeekAbbr(date)}
                        </div>
                        <div className={`text-[10px] leading-tight font-semibold ${wknd ? (isOT ? 'text-amber-800' : 'text-gray-600') : dayNumber(date) === 1 ? 'text-blue-700' : 'text-gray-800'}`}>
                          {dayNumber(date)}
                        </div>
                        {wknd && isOT && <div className="text-[8px] text-amber-600 font-bold">OT</div>}
                      </th>
                    )
                  })
                : weekGroups.map(wg => (
                    <th key={`${wg.monthLabel}-${wg.weekLabel}`} className="border border-gray-200 text-center w-10 bg-blue-50 text-blue-600 font-semibold py-1">{wg.weekLabel}</th>
                  ))
              }
              <th className="border border-gray-200 bg-gray-100" />
            </tr>
          </thead>
          <tbody>
            {activities.map(row => (
              <ActivityRowUI
                key={row.id}
                row={row}
                allDays={allDays}
                weekGroups={weekGroups}
                otSet={otSet}
                viewMode={viewMode}
                personRoles={personRoles}
                picListId={`pl-${row.id}`}
                readOnly={readOnly}
                partialEdit={partialEdit}
                onChange={changes => (readOnly || partialEdit) ? undefined : updateRow(row.id, changes)}
                onChangeStatus={status => !readOnly && updateRow(row.id, { status })}
                onDelete={() => deleteRow(row.id)}
                onAddActivity={() => addRow(row.id, false)}
                onAddPIC={() => addPICEntry(row.id)}
                onDeletePIC={id => deletePICEntry(row.id, id)}
                onUpdatePIC={(id, c) => updatePICEntry(row.id, id, c)}
                onToggleDay={(date, type) => readOnly ? undefined : toggleDay(row.id, date, type)}
                onToggleWeek={(dates, type) => readOnly ? undefined : toggleWeekGroup(row.id, dates, type)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PIC role chip selector ────────────────────────────────────────────────────

const ROLE_CHIP: Record<string, { bg: string; text: string; border: string }> = {
  'Requestor':    { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200'     },
  'SMART Member': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'SE':           { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  'PM':           { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  'Manager':      { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
  'Designer':     { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200'    },
  'Developer':    { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200'  },
}

function PICSelect({ value, onChange, roles, onDelete, canDelete }: {
  value: string; onChange: (v: string) => void; roles: string[]
  onDelete?: () => void; canDelete?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const chip = ROLE_CHIP[value]
  const filtered = roles.filter(r => r.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch('') }}
        className={[
          'w-full flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium cursor-pointer transition-colors',
          chip
            ? `${chip.bg} ${chip.text} ${chip.border} hover:brightness-95`
            : 'bg-gray-50 text-gray-400 border-dashed border-gray-300 hover:border-blue-300 hover:text-gray-500',
        ].join(' ')}
      >
        <span className="flex-1 text-left truncate">{value || '+ add PIC'}</span>
        <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-44 overflow-hidden">
          {/* Search */}
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-300 bg-gray-50"
              placeholder="Search role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Options */}
          <div className="py-1 max-h-40 overflow-y-auto">
            {filtered.map(role => {
              const c = ROLE_CHIP[role]
              return (
                <button key={role} type="button"
                  className={[
                    'w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors',
                    value === role ? 'bg-blue-50' : 'hover:bg-gray-50',
                  ].join(' ')}
                  onClick={() => { onChange(role); setOpen(false); setSearch('') }}
                >
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${c?.bg ?? 'bg-gray-100'} ${c?.text ?? 'text-gray-600'} ${c?.border ?? 'border-gray-200'}`}>
                    {role}
                  </span>
                  {value === role && <svg className="w-3 h-3 text-blue-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">No match</p>
            )}
          </div>
          {/* Clear / delete */}
          <div className="border-t border-gray-100 p-1 flex gap-1">
            {value && (
              <button type="button"
                className="flex-1 text-[10px] text-gray-400 hover:text-gray-600 py-1 hover:bg-gray-50 rounded"
                onClick={() => { onChange(''); setOpen(false) }}>
                Clear
              </button>
            )}
            {canDelete && onDelete && (
              <button type="button"
                className="flex-1 text-[10px] text-red-400 hover:text-red-600 py-1 hover:bg-red-50 rounded"
                onClick={() => { onDelete(); setOpen(false) }}>
                Remove row
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  row: ActivityRow; allDays: string[]; weekGroups: WeekGroup[]; otSet: Set<string>
  viewMode: ViewMode; personRoles: string[]; picListId: string; readOnly?: boolean; partialEdit?: boolean
  onChange: (c: Partial<ActivityRow>) => void | undefined
  onChangeStatus: (status: ActivityRow['status']) => void
  onDelete: () => void; onAddActivity: () => void
  onAddPIC: () => void; onDeletePIC: (id: string) => void; onUpdatePIC: (id: string, c: Partial<PICEntry>) => void
  onToggleDay: (date: string, type: 'plan' | 'actual') => void | undefined
  onToggleWeek: (dates: string[], type: 'plan' | 'actual') => void | undefined
}

function ActivityRowUI(p: RowProps) {
  const { row, allDays, weekGroups, otSet, viewMode, personRoles } = p
  // In partialEdit mode, only actual marks and status are editable
  const fieldLocked = p.readOnly || p.partialEdit

  const markMap = useMemo(() => {
    const m = new Map<string, { plan: boolean; actual: boolean }>()
    for (const dm of row.dayMarks) m.set(dm.date, { plan: dm.plan, actual: dm.actual })
    return m
  }, [row.dayMarks])

  if (row.isPhase) {
    return (
      <tr className="bg-blue-50">
        <td className="border border-gray-200 px-1 py-1 sticky left-0 bg-blue-50 z-10">
          <input className="w-8 bg-transparent text-xs font-semibold text-blue-800 focus:outline-none disabled:pointer-events-none" disabled={fieldLocked} value={row.number} onChange={e => p.onChange({ number: e.target.value })} />
        </td>
        <td className="border border-gray-200 px-2 py-1 sticky left-8 bg-blue-50 z-10" colSpan={12}>
          <AutoTextarea
            className="w-full bg-transparent text-xs font-semibold text-blue-800 focus:outline-none disabled:pointer-events-none"
            value={row.name}
            disabled={fieldLocked}
            onChange={v => p.onChange({ name: v })}
          />
        </td>
        {viewMode === 'daily'
          ? allDays.map(date => (
              <td key={date} className={`w-6 ${isWeekend(date) ? 'bg-gray-100' : 'bg-blue-50'} ${dayCellBorder(date)}`} />
            ))
          : weekGroups.map((_wg, i) => <td key={i} className="border border-gray-200 w-10 bg-blue-50" />)
        }
        <td className="border border-gray-200 px-1 text-center">
          {!p.readOnly && !p.partialEdit && <button onClick={p.onDelete} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
        </td>
      </tr>
    )
  }

  const dayCell = (date: string, type: 'plan' | 'actual') => {
    const wknd = isWeekend(date); const isOT = otSet.has(date); const locked = wknd && !isOT
    const mark = markMap.get(date); const active = type === 'plan' ? mark?.plan : mark?.actual
    const sym = type === 'plan' ? '○' : '●'
    const symColor = type === 'plan' ? 'text-blue-600' : 'text-orange-500'
    const hoverBg = type === 'plan' ? 'hover:bg-blue-50' : 'hover:bg-orange-50'
    const planLocked = locked || p.readOnly || (p.partialEdit && type === 'plan')
    const actualLocked = locked || p.readOnly
    const cellLocked = type === 'plan' ? planLocked : actualLocked
    const bg = cellLocked ? 'bg-gray-100 cursor-not-allowed' : wknd ? `bg-amber-50 ${hoverBg}` : `bg-white ${hoverBg}`
    return (
      <td key={date} className={`text-center w-6 ${cellLocked ? bg : `cursor-pointer ${bg}`} ${dayCellBorder(date)}`}
        onClick={cellLocked ? undefined : () => p.onToggleDay(date, type)}>
        {active && <span className={`font-bold text-sm leading-none ${symColor}`}>{sym}</span>}
      </td>
    )
  }

  const weekCell = (wg: WeekGroup, type: 'plan' | 'actual') => {
    const anyMarked = wg.dates.some(d => type === 'plan' ? markMap.get(d)?.plan : markMap.get(d)?.actual)
    const sym = type === 'plan' ? '○' : '●'; const symColor = type === 'plan' ? 'text-blue-600' : 'text-orange-500'
    return (
      <td key={`${wg.monthLabel}-${wg.weekLabel}`}
        className={`border border-gray-200 text-center w-10 bg-white ${(p.readOnly || (p.partialEdit && type === 'plan')) ? 'cursor-default' : `cursor-pointer ${type === 'plan' ? 'hover:bg-blue-50' : 'hover:bg-orange-50'}`}`}
        onClick={(p.readOnly || (p.partialEdit && type === 'plan')) ? undefined : () => p.onToggleWeek(wg.dates, type)}>
        {anyMarked && <span className={`font-bold text-sm leading-none ${symColor}`}>{sym}</span>}
      </td>
    )
  }

  // Stacked PIC + RACI entries — rendered inside a single merged cell (colSpan=5, rowSpan=2)
  const picRaciCell = (
    <td className="border border-gray-200 px-1 py-0.5 align-top" colSpan={5} rowSpan={2}>
      <div className="space-y-0.5">
        {row.picEntries.map(entry => (
          <div key={entry.id} className="flex items-center gap-1">
            {/* PIC selector — fixed width matches PIC column (w-20) */}
            <div className="w-20 shrink-0">
              {fieldLocked ? (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border block truncate ${ROLE_CHIP[entry.pic]?.bg ?? 'bg-gray-50'} ${ROLE_CHIP[entry.pic]?.text ?? 'text-gray-500'} ${ROLE_CHIP[entry.pic]?.border ?? 'border-gray-200'}`}>
                  {entry.pic || '—'}
                </span>
              ) : (
                <PICSelect
                  value={entry.pic}
                  onChange={v => p.onUpdatePIC(entry.id, { pic: v })}
                  roles={personRoles}
                  canDelete={false}
                  onDelete={undefined}
                />
              )}
            </div>
            {/* RACI checkboxes — each w-5 to match R/A/C/I column widths */}
            {(['r','a','c','i'] as (keyof RACI)[]).map(k => (
              <div key={k} className="w-5 shrink-0 flex justify-center">
                <input
                  type="checkbox"
                  title={k.toUpperCase()}
                  checked={entry.raci[k]}
                  disabled={fieldLocked}
                  onChange={e => p.onUpdatePIC(entry.id, { raci: { ...entry.raci, [k]: e.target.checked } })}
                  className="accent-blue-500 w-3 h-3 cursor-pointer disabled:opacity-60 disabled:cursor-default"
                />
              </div>
            ))}
            {/* Remove this PIC entry — only when multiple entries exist */}
            {!p.readOnly && !p.partialEdit && row.picEntries.length > 1 && (
              <button onClick={() => p.onDeletePIC(entry.id)} className="text-gray-300 hover:text-red-400 text-[10px]" title="Remove PIC">✕</button>
            )}
          </div>
        ))}
        {!p.readOnly && !p.partialEdit && row.picEntries.every(e => e.pic) && (
          <button onClick={p.onAddPIC} className="text-green-500 hover:text-green-700 text-[10px] font-medium pt-0.5">+ add PIC</button>
        )}
      </div>
    </td>
  )

  return (
    <>
      {/* Plan row — fixed cols span both Plan + Actual rows; PIC+RACI merged cell also spans both */}
      <tr className="hover:bg-gray-50">
        <td className="border border-gray-200 px-1 py-0.5 sticky left-0 bg-white z-10 align-top" rowSpan={2}>
          <input className="w-8 bg-transparent text-xs text-gray-600 focus:outline-none disabled:pointer-events-none" disabled={fieldLocked} value={row.number} onChange={e => p.onChange({ number: e.target.value })} />
        </td>
        <td className="border border-gray-200 px-2 py-0.5 sticky left-8 bg-white z-10 align-top" rowSpan={2}>
          <AutoTextarea
            className="w-full bg-transparent text-xs text-gray-800 focus:outline-none min-w-40 disabled:pointer-events-none"
            value={row.name}
            disabled={fieldLocked}
            onChange={v => p.onChange({ name: v })}
          />
        </td>

        {/* PIC + RACI stacked — spans both Plan and Actual rows */}
        {picRaciCell}

        {/* Status / % / MH / Days — span both rows */}
        <td className="border border-gray-200 px-0.5 py-0.5 align-top" rowSpan={2}>
          {/* Status editable even in partialEdit */}
          <select className={`w-full text-xs bg-transparent focus:outline-none font-medium ${STATUS_COLOR[row.status] ?? 'text-gray-500'} disabled:pointer-events-none`}
            value={row.status} title={row.status} disabled={p.readOnly}
            onChange={e => p.onChangeStatus(e.target.value as ActivityRow['status'])}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_SHORT[s]}</option>)}
          </select>
        </td>
        <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={2}>
          {p.partialEdit || row.autoProgress !== false ? (
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium text-blue-600 text-center w-full leading-tight pt-0.5">{calcAutoProgress(row)}</span>
              {!fieldLocked && (
                <button onClick={() => p.onChange({ autoProgress: false, progress: calcAutoProgress(row) })} title="Auto % on"
                  className="text-[8px] font-bold text-blue-400 hover:text-gray-500 bg-blue-50 px-0.5 rounded leading-none mt-0.5">A</button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <input type="number" min={0} max={100} className="w-full text-xs bg-transparent focus:outline-none text-center text-gray-600 disabled:pointer-events-none leading-tight"
                disabled={fieldLocked} value={row.progress} onChange={e => p.onChange({ progress: Number(e.target.value) })} />
              {!fieldLocked && (
                <button onClick={() => p.onChange({ autoProgress: true })} title="Enable auto %"
                  className="text-[8px] text-gray-300 hover:text-blue-400 px-0.5 rounded leading-none mt-0.5">A</button>
              )}
            </div>
          )}
        </td>
        <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={2}>
          <input type="number" min={0} step={0.5} className="w-full text-xs bg-transparent focus:outline-none text-center text-gray-600 disabled:pointer-events-none"
            disabled={fieldLocked} value={row.mh} onChange={e => p.onChange({ mh: Number(e.target.value) })} />
        </td>
        <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={2} title="Auto-counted from Plan marks.">
          <input type="number" min={0} className="w-full text-xs bg-transparent focus:outline-none text-center text-blue-600 font-medium disabled:pointer-events-none"
            disabled={fieldLocked} value={row.workingDays} onChange={e => p.onChange({ workingDays: Number(e.target.value) })} />
        </td>

        {/* Plan label + clickable calendar cells — plan marks locked in partialEdit */}
        <td className="border border-gray-200 px-0.5 py-0.5 text-center text-blue-600 font-semibold text-xs whitespace-nowrap bg-blue-50">Plan</td>
        {viewMode === 'daily' ? allDays.map(date => dayCell(date, 'plan')) : weekGroups.map(wg => weekCell(wg, 'plan'))}

        {/* Actions — hidden in partialEdit */}
        <td className="border border-gray-200 px-0.5 py-0.5 text-center align-top" rowSpan={2}>
          {!p.readOnly && !p.partialEdit && (
            <div className="flex flex-col items-center gap-0.5">
              <button onClick={p.onAddActivity} className="text-blue-400 hover:text-blue-600 text-[10px]" title="Add activity below">+row</button>
              <button onClick={p.onDelete} className="text-red-300 hover:text-red-500 text-[10px]" title="Delete row">✕</button>
            </div>
          )}
        </td>
      </tr>

      {/* Actual row — only Actual label + clickable calendar cells (all other cols covered by rowSpan above) */}
      <tr className="hover:bg-gray-50">
        <td className="border border-gray-200 px-0.5 py-0.5 text-center text-orange-500 font-semibold text-xs whitespace-nowrap bg-orange-50">Actual</td>
        {viewMode === 'daily' ? allDays.map(date => dayCell(date, 'actual')) : weekGroups.map(wg => weekCell(wg, 'actual'))}
      </tr>
    </>
  )
}
