import { } from 'react'
import type { ActivityPlan, MonthConfig, GroupType, Stakeholder } from '../types'
import { PERSON_ROLES } from '../types'
import { monthLabel, syncDayMarks, generateDayMarks, calcPlanStatus, generateId } from '../utils'

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
  readOnly?: boolean
}

const STATUS_STYLE = {
  'COMPLETE':    { bg: 'bg-green-100',  text: 'text-green-700',  bar: 'bg-green-500'  },
  'ON TIME':     { bg: 'bg-blue-100',   text: 'text-blue-700',   bar: 'bg-blue-500'   },
  'AT RISK':     { bg: 'bg-amber-100',  text: 'text-amber-700',  bar: 'bg-amber-500'  },
  'DELAYED':     { bg: 'bg-red-100',    text: 'text-red-700',    bar: 'bg-red-500'    },
  'NOT STARTED': { bg: 'bg-gray-100',   text: 'text-gray-600',   bar: 'bg-gray-400'   },
}

const GROUP_STYLE: Record<GroupType, string> = {
  SMART:   'bg-purple-50 text-purple-700 border-purple-200',
  DEV:     'bg-blue-50 text-blue-700 border-blue-200',
  NETWORK: 'bg-teal-50 text-teal-700 border-teal-200',
}

const ROLE_COLORS: Record<string, string> = {
  'Project Manager':         'bg-amber-50 text-amber-700 border-amber-200',
  'Project Supervisor':      'bg-rose-50 text-rose-700 border-rose-200',
  'Project Leader':          'bg-blue-50 text-blue-700 border-blue-200',
  'Support Supervisor':      'bg-teal-50 text-teal-700 border-teal-200',
  'System Expert':           'bg-purple-50 text-purple-700 border-purple-200',
  'Support PIC':             'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Designer':                'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Developer':               'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Technical Reviewer':      'bg-slate-50 text-slate-700 border-slate-200',
  'DBA/Release Support PIC': 'bg-violet-50 text-violet-700 border-violet-200',
  'Gatepass PIC':            'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'Requestor':               'bg-sky-50 text-sky-700 border-sky-200',
  'Customer':                'bg-green-50 text-green-700 border-green-200',
  // legacy
  'Main Support':            'bg-emerald-50 text-emerald-700 border-emerald-200',
  'SE':                      'bg-purple-50 text-purple-700 border-purple-200',
  'PM':                      'bg-amber-50 text-amber-700 border-amber-200',
}

export default function PlanHeader({ plan, onChange, readOnly }: Props) {
  const isDev = plan.type === 'development'
  const stakeholders: Stakeholder[] = plan.stakeholders ?? []

  function setField(field: string, value: string) {
    onChange({ ...plan, [field]: value })
  }

  function applyMonthChange(newMonths: MonthConfig[]) {
    const validDates = new Set(generateDayMarks(newMonths).map(d => d.date))
    onChange({
      ...plan,
      months: newMonths,
      activities: plan.activities.map(a => ({ ...a, dayMarks: syncDayMarks(a.dayMarks, newMonths) })),
      otDays: plan.otDays.filter(d => validDates.has(d)),
    })
  }

  function addMonth() {
    const last = plan.months[plan.months.length - 1]
    const next: MonthConfig = last.month === 11
      ? { year: last.year + 1, month: 0 }
      : { year: last.year, month: last.month + 1 }
    applyMonthChange([...plan.months, next])
  }

  function removeMonth(idx: number) {
    if (plan.months.length <= 1) return
    applyMonthChange(plan.months.filter((_, i) => i !== idx))
  }

  function updateMonth(idx: number, m: MonthConfig) {
    applyMonthChange(plan.months.map((x, i) => (i === idx ? m : x)))
  }

  function addStakeholder() {
    const entry: Stakeholder = { id: generateId(), name: '', roles: [] }
    onChange({ ...plan, stakeholders: [...stakeholders, entry] })
  }

  function updateStakeholderName(id: string, name: string) {
    onChange({ ...plan, stakeholders: stakeholders.map(s => s.id === id ? { ...s, name } : s) })
  }

  function addRoleToStakeholder(id: string, role: string) {
    onChange({
      ...plan,
      stakeholders: stakeholders.map(s =>
        s.id === id && !s.roles.includes(role) ? { ...s, roles: [...s.roles, role] } : s
      ),
    })
  }

  function removeRoleFromStakeholder(id: string, role: string) {
    onChange({
      ...plan,
      stakeholders: stakeholders.map(s =>
        s.id === id ? { ...s, roles: s.roles.filter(r => r !== role) } : s
      ),
    })
  }

  function removeStakeholder(id: string) {
    onChange({ ...plan, stakeholders: stakeholders.filter(s => s.id !== id) })
  }

  const status = calcPlanStatus(plan)
  const style = STATUS_STYLE[status.label]

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-500">{isDev ? 'Project Title' : 'Support Title'}</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={plan.title}
          disabled={readOnly}
          onChange={e => setField('title', e.target.value)}
          placeholder={isDev ? 'Enter project title' : 'Enter support title'}
        />
      </div>

      {/* IT Number */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-500">IT Number</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={plan.itNumber ?? ''}
          disabled={readOnly}
          onChange={e => setField('itNumber', e.target.value)}
          placeholder="e.g. IT-2026-001"
        />
      </div>

      {/* Version + Type */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Version</label>
          <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={plan.documentVersion} disabled={readOnly} onChange={e => setField('documentVersion', e.target.value)} placeholder="1.00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <div className={`text-xs font-semibold px-2 py-2 rounded-lg text-center ${isDev ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
            {isDev ? 'Development' : 'Support'}
          </div>
        </div>
      </div>

      {/* Group Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Group</label>
        {readOnly ? (
          plan.groupType ? (
            <div className={`text-xs font-semibold px-2 py-1.5 rounded-lg border text-center ${GROUP_STYLE[plan.groupType]}`}>
              {plan.groupType}
            </div>
          ) : (
            <div className="text-xs text-gray-400 px-2 py-1.5">—</div>
          )
        ) : (
          <select
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            value={plan.groupType ?? ''}
            onChange={e => onChange({ ...plan, groupType: (e.target.value as GroupType) || undefined })}
          >
            <option value="">— Select Group —</option>
            <option value="SMART">SMART</option>
            <option value="DEV">DEV</option>
            <option value="NETWORK">NETWORK</option>
          </select>
        )}
      </div>

      {/* Target Date */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Target Date</label>
        <input
          type="date"
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={plan.targetDate ?? ''}
          disabled={readOnly}
          onChange={e => setField('targetDate', e.target.value)}
        />
      </div>

      {/* Status indicator */}
      {plan.targetDate && (
        <div className={`rounded-lg border ${style.bg} p-2.5 space-y-1.5`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text} border border-current border-opacity-30`}>
              {status.label}
            </span>
            <span className="text-xs text-gray-500">
              {status.daysLeft != null
                ? status.daysLeft > 0 ? `${status.daysLeft}d left` : `${Math.abs(status.daysLeft)}d overdue`
                : ''}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>Actual progress</span>
              <span>{status.progress.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white rounded-full border border-gray-200 overflow-hidden relative">
              <div className="absolute top-0 h-full w-0.5 bg-gray-400 z-10" style={{ left: `${status.expectedProgress}%` }} title={`Expected: ${status.expectedProgress.toFixed(0)}%`} />
              <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${status.progress}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Expected: {status.expectedProgress.toFixed(0)}%</span>
              <span>Target: {plan.targetDate}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stakeholders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-medium text-gray-500">Stakeholders</p>
            <p className="text-[10px] text-gray-400">Roles shown in PIC dropdown</p>
          </div>
          {!readOnly && (
            <button
              onClick={addStakeholder}
              className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition-colors font-medium shrink-0"
            >
              + Person
            </button>
          )}
        </div>

        {stakeholders.length === 0 && (
          <p className="text-xs text-gray-400 italic">{readOnly ? 'No stakeholders added.' : 'Click + Person to add.'}</p>
        )}

        <div className="space-y-2">
          {stakeholders.map(s => (
            <div key={s.id} className="border border-gray-100 rounded-lg p-2 bg-gray-50/50 space-y-1.5">
              {/* Name row */}
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-transparent disabled:border-transparent disabled:text-gray-600 font-medium"
                  value={s.name}
                  disabled={readOnly}
                  onChange={e => updateStakeholderName(s.id, e.target.value)}
                  placeholder="Full name"
                />
                {!readOnly && (
                  <button onClick={() => removeStakeholder(s.id)} className="text-gray-300 hover:text-red-400 text-xs leading-none shrink-0 transition-colors" title="Remove person">✕</button>
                )}
              </div>

              {/* Roles row */}
              <div className="flex flex-wrap items-center gap-1 pl-4">
                {s.roles.map(role => {
                  const cc = ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                  return (
                    <span key={role} className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cc}`}>
                      {role}
                      {!readOnly && (
                        <button onClick={() => removeRoleFromStakeholder(s.id, role)} className="hover:text-red-500 ml-0.5 leading-none" title="Remove role">×</button>
                      )}
                    </span>
                  )
                })}
                {!readOnly && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) addRoleToStakeholder(s.id, e.target.value) }}
                    className="text-[10px] text-blue-500 border border-dashed border-blue-300 rounded-full px-1.5 py-0.5 bg-white focus:outline-none cursor-pointer hover:border-blue-400 transition-colors"
                  >
                    <option value="">+ Role</option>
                    {PERSON_ROLES.filter(r => !s.roles.includes(r)).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
                {s.roles.length === 0 && readOnly && (
                  <span className="text-[10px] text-gray-400 italic">No roles assigned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Months */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-xs font-medium text-gray-500">Calendar Months</p>
          {!readOnly && <button onClick={addMonth} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100 transition-colors">+ Add</button>}
        </div>
        <div className="space-y-1">
          {plan.months.map((m, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5">
              <input
                type="month"
                className="text-xs border-none bg-transparent focus:outline-none text-gray-700 flex-1"
                value={`${m.year}-${String(m.month + 1).padStart(2, '0')}`}
                onChange={e => {
                  const [y, mo] = e.target.value.split('-').map(Number)
                  updateMonth(idx, { year: y, month: mo - 1 })
                }}
              />
              <span className="text-xs text-gray-400">{monthLabel(m)}</span>
              {!readOnly && <button onClick={() => removeMonth(idx)} className="text-gray-300 hover:text-red-400 text-xs leading-none ml-1">✕</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
