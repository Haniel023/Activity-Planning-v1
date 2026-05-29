import { useMemo, useState } from 'react'
import type { ActivityPlan, ActivityRow, MonthConfig, PICEntry, RACI } from '../types'
import {
  generateId, generateDayMarks, isWeekend, dayOfWeekAbbr, dayNumber,
  daysInMonth, toDateStr, monthLabel, STATUS_OPTIONS, makePICEntry,
  getNextPhaseNumber, getNextSubNumber, getPersonRoles,
} from '../utils'

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

const STATUS_SHORT: Record<string, string> = {
  'NOT YET STARTED': 'Not Yet', 'ONGOING': 'Ongoing', 'DONE': 'Done', 'ON HOLD': 'On Hold',
}
const STATUS_COLOR: Record<string, string> = {
  'NOT YET STARTED': 'text-gray-500', 'ONGOING': 'text-blue-600', 'DONE': 'text-green-600', 'ON HOLD': 'text-amber-600',
}

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
}

export default function ActivityTable({ plan, onChange }: Props) {
  const { activities, months, otDays } = plan
  const [viewMode, setViewMode] = useState<ViewMode>('daily')

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
      status: 'NOT YET STARTED', progress: 0, mh: 0, workingDays: 0,
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
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">Activity Plan</h2>
          <div className="flex border border-gray-200 rounded overflow-hidden text-xs">
            <button className={`px-2.5 py-1 transition-colors ${viewMode === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setViewMode('weekly')}>Weekly</button>
            <button className={`px-2.5 py-1 transition-colors ${viewMode === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setViewMode('daily')}>Daily</button>
          </div>
          <button onClick={() => addLast(true)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded">+ Phase</button>
          <button onClick={() => addLast(false)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded">+ Activity</button>
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
                <span className="text-[10px]">Responsibility</span>
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
                            ? isOT ? 'bg-amber-100 cursor-pointer hover:bg-amber-200' : 'bg-gray-300 cursor-pointer hover:bg-gray-400'
                            : 'bg-white',
                        ].join(' ')}
                        onClick={wknd ? () => toggleOTDay(date) : undefined}
                        title={wknd ? (isOT ? `${date} — OT enabled (click to disable)` : `${date} — Weekend (click to enable OT)`) : date}
                      >
                        <div className={`text-[9px] leading-tight font-medium ${wknd ? (isOT ? 'text-amber-700' : 'text-gray-500') : 'text-gray-500'}`}>
                          {dayOfWeekAbbr(date)}
                        </div>
                        <div className={`text-[10px] leading-tight font-semibold ${wknd ? (isOT ? 'text-amber-800' : 'text-gray-500') : 'text-gray-800'}`}>
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
                onChange={changes => updateRow(row.id, changes)}
                onDelete={() => deleteRow(row.id)}
                onAddActivity={() => addRow(row.id, false)}
                onAddPIC={() => addPICEntry(row.id)}
                onDeletePIC={id => deletePICEntry(row.id, id)}
                onUpdatePIC={(id, c) => updatePICEntry(row.id, id, c)}
                onToggleDay={(date, type) => toggleDay(row.id, date, type)}
                onToggleWeek={(dates, type) => toggleWeekGroup(row.id, dates, type)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  row: ActivityRow; allDays: string[]; weekGroups: WeekGroup[]; otSet: Set<string>
  viewMode: ViewMode; personRoles: string[]; picListId: string
  onChange: (c: Partial<ActivityRow>) => void; onDelete: () => void; onAddActivity: () => void
  onAddPIC: () => void; onDeletePIC: (id: string) => void; onUpdatePIC: (id: string, c: Partial<PICEntry>) => void
  onToggleDay: (date: string, type: 'plan' | 'actual') => void
  onToggleWeek: (dates: string[], type: 'plan' | 'actual') => void
}

function ActivityRowUI(p: RowProps) {
  const { row, allDays, weekGroups, otSet, viewMode, personRoles, picListId } = p

  const markMap = useMemo(() => {
    const m = new Map<string, { plan: boolean; actual: boolean }>()
    for (const dm of row.dayMarks) m.set(dm.date, { plan: dm.plan, actual: dm.actual })
    return m
  }, [row.dayMarks])

  if (row.isPhase) {
    return (
      <tr className="bg-blue-50">
        <td className="border border-gray-200 px-1 py-1 sticky left-0 bg-blue-50 z-10">
          <input className="w-8 bg-transparent text-xs font-semibold text-blue-800 focus:outline-none" value={row.number} onChange={e => p.onChange({ number: e.target.value })} />
        </td>
        <td className="border border-gray-200 px-2 py-1 sticky left-8 bg-blue-50 z-10" colSpan={12}>
          <input className="w-full bg-transparent text-xs font-semibold text-blue-800 focus:outline-none" value={row.name} onChange={e => p.onChange({ name: e.target.value })} />
        </td>
        {viewMode === 'daily'
          ? allDays.map(date => <td key={date} className={`border border-gray-200 w-6 ${isWeekend(date) ? 'bg-blue-100' : 'bg-blue-50'}`} />)
          : weekGroups.map((_wg, i) => <td key={i} className="border border-gray-200 w-10 bg-blue-50" />)
        }
        <td className="border border-gray-200 px-1 text-center">
          <button onClick={p.onDelete} className="text-red-300 hover:text-red-500 text-xs">✕</button>
        </td>
      </tr>
    )
  }

  const totalSpan = row.picEntries.length + 2

  const dayCell = (date: string, type: 'plan' | 'actual') => {
    const wknd = isWeekend(date); const isOT = otSet.has(date); const locked = wknd && !isOT
    const mark = markMap.get(date); const active = type === 'plan' ? mark?.plan : mark?.actual
    const sym = type === 'plan' ? '○' : '●'
    const symColor = type === 'plan' ? 'text-blue-600' : 'text-orange-500'
    const hoverBg = type === 'plan' ? 'hover:bg-blue-50' : 'hover:bg-orange-50'
    // Weekend cells: clearly gray; OT weekend: amber; weekdays: white
    const bg = locked ? 'bg-gray-200 cursor-not-allowed' : wknd ? `bg-amber-50 ${hoverBg}` : `bg-white ${hoverBg}`
    return (
      <td key={date} className={`border border-gray-200 text-center w-6 ${locked ? bg : `cursor-pointer ${bg}`}`}
        onClick={locked ? undefined : () => p.onToggleDay(date, type)}>
        {active && <span className={`font-bold text-sm leading-none ${symColor}`}>{sym}</span>}
      </td>
    )
  }

  const weekCell = (wg: WeekGroup, type: 'plan' | 'actual') => {
    const anyMarked = wg.dates.some(d => type === 'plan' ? markMap.get(d)?.plan : markMap.get(d)?.actual)
    const sym = type === 'plan' ? '○' : '●'; const symColor = type === 'plan' ? 'text-blue-600' : 'text-orange-500'
    return (
      <td key={`${wg.monthLabel}-${wg.weekLabel}`}
        className={`border border-gray-200 text-center w-10 cursor-pointer bg-white ${type === 'plan' ? 'hover:bg-blue-50' : 'hover:bg-orange-50'}`}
        onClick={() => p.onToggleWeek(wg.dates, type)}>
        {anyMarked && <span className={`font-bold text-sm leading-none ${symColor}`}>{sym}</span>}
      </td>
    )
  }

  const emptyCalCells = viewMode === 'daily'
    ? allDays.map(date => {
        const wknd = isWeekend(date); const isOT = otSet.has(date)
        return <td key={date} className={`border border-gray-200 w-6 ${wknd ? (isOT ? 'bg-amber-50' : 'bg-gray-200') : 'bg-white'}`} />
      })
    : weekGroups.map((_wg, i) => <td key={i} className="border border-gray-200 w-10 bg-white" />)

  return (
    <>
      {/* PIC entry rows */}
      {row.picEntries.map((entry, ei) => (
        <tr key={entry.id} className="hover:bg-gray-50">
          {ei === 0 && (
            <td className="border border-gray-200 px-1 py-0.5 sticky left-0 bg-white z-10 align-top" rowSpan={totalSpan}>
              <input className="w-8 bg-transparent text-xs text-gray-600 focus:outline-none" value={row.number} onChange={e => p.onChange({ number: e.target.value })} />
            </td>
          )}
          {ei === 0 && (
            <td className="border border-gray-200 px-2 py-0.5 sticky left-8 bg-white z-10 align-top" rowSpan={totalSpan}>
              <input className="w-full bg-transparent text-xs text-gray-800 focus:outline-none min-w-40" value={row.name} onChange={e => p.onChange({ name: e.target.value })} />
            </td>
          )}
          {/* PIC with datalist */}
          <td className="border border-gray-200 px-1 py-0.5">
            <div className="flex items-center gap-0.5">
              <input
                list={picListId}
                className="flex-1 bg-transparent text-xs text-gray-600 focus:outline-none min-w-0 w-16"
                value={entry.pic}
                onChange={e => p.onUpdatePIC(entry.id, { pic: e.target.value })}
                placeholder="PIC"
              />
              {row.picEntries.length > 1 && (
                <button onClick={() => p.onDeletePIC(entry.id)} className="text-red-200 hover:text-red-400 text-[10px] flex-shrink-0">✕</button>
              )}
            </div>
          </td>
          <datalist id={picListId}>
            {personRoles.map(r => <option key={r} value={r} />)}
          </datalist>
          {/* RACI */}
          {(['r','a','c','i'] as (keyof RACI)[]).map(k => (
            <td key={k} className="border border-gray-200 text-center w-5">
              <input type="checkbox" checked={entry.raci[k]}
                onChange={e => p.onUpdatePIC(entry.id, { raci: { ...entry.raci, [k]: e.target.checked } })}
                className="accent-blue-500 w-3 h-3" />
            </td>
          ))}
          {/* Fixed cols — only first PIC row, with rowSpan */}
          {ei === 0 && (
            <>
              <td className="border border-gray-200 px-0.5 py-0.5 align-top" rowSpan={totalSpan}>
                <select className={`w-full text-xs bg-transparent focus:outline-none font-medium ${STATUS_COLOR[row.status] ?? 'text-gray-500'}`}
                  value={row.status} title={row.status}
                  onChange={e => p.onChange({ status: e.target.value as ActivityRow['status'] })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_SHORT[s]}</option>)}
                </select>
              </td>
              <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={totalSpan}>
                <input type="number" min={0} max={100} className="w-full text-xs bg-transparent focus:outline-none text-center text-gray-600"
                  value={row.progress} onChange={e => p.onChange({ progress: Number(e.target.value) })} />
              </td>
              <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={totalSpan}>
                <input type="number" min={0} step={0.5} className="w-full text-xs bg-transparent focus:outline-none text-center text-gray-600"
                  value={row.mh} onChange={e => p.onChange({ mh: Number(e.target.value) })} />
              </td>
              <td className="border border-gray-200 px-0 py-0.5 align-top" rowSpan={totalSpan}
                title="Auto-counted from Plan marks. Edit manually if needed.">
                <input type="number" min={0} className="w-full text-xs bg-transparent focus:outline-none text-center text-blue-600 font-medium"
                  value={row.workingDays} onChange={e => p.onChange({ workingDays: Number(e.target.value) })} />
              </td>
            </>
          )}
          <td className="border border-gray-200 w-10 bg-white" />
          {emptyCalCells}
          {ei === 0 && (
            <td className="border border-gray-200 px-0.5 py-0.5 text-center align-top" rowSpan={totalSpan}>
              <div className="flex flex-col items-center gap-0.5">
                <button onClick={p.onAddActivity} className="text-blue-400 hover:text-blue-600 text-[10px]" title="Add activity below">+row</button>
                <button onClick={p.onAddPIC} className="text-green-400 hover:text-green-600 text-[10px]" title="Add PIC entry">+pic</button>
                <button onClick={p.onDelete} className="text-red-300 hover:text-red-500 text-[10px]" title="Delete">✕</button>
              </div>
            </td>
          )}
        </tr>
      ))}

      {/* Plan row */}
      <tr className="hover:bg-gray-50">
        <td className="border border-gray-200 px-0.5 py-0.5 text-center text-blue-600 font-semibold text-xs whitespace-nowrap bg-blue-50" colSpan={5}>Plan</td>
        {viewMode === 'daily' ? allDays.map(date => dayCell(date, 'plan')) : weekGroups.map(wg => weekCell(wg, 'plan'))}
      </tr>
      {/* Actual row */}
      <tr className="hover:bg-gray-50">
        <td className="border border-gray-200 px-0.5 py-0.5 text-center text-orange-500 font-semibold text-xs whitespace-nowrap bg-orange-50" colSpan={5}>Actual</td>
        {viewMode === 'daily' ? allDays.map(date => dayCell(date, 'actual')) : weekGroups.map(wg => weekCell(wg, 'actual'))}
      </tr>
    </>
  )
}
