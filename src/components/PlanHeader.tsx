import type { ActivityPlan, DevPersons, SupportPersons, MonthConfig, GroupType, AdditionalPerson } from '../types'
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

export default function PlanHeader({ plan, onChange, readOnly }: Props) {
  const isDev = plan.type === 'development'
  const persons = plan.persons as DevPersons & SupportPersons

  function setField(field: string, value: string) {
    onChange({ ...plan, [field]: value })
  }

  function setPerson(field: string, value: string) {
    onChange({ ...plan, persons: { ...plan.persons, [field]: value } })
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

  const additionalPersons: AdditionalPerson[] = plan.additionalPersons ?? []

  function addAdditionalPerson() {
    onChange({ ...plan, additionalPersons: [...additionalPersons, { id: generateId(), role: '', name: '' }] })
  }

  function updateAdditionalPerson(id: string, field: 'role' | 'name', value: string) {
    onChange({
      ...plan,
      additionalPersons: additionalPersons.map(p => p.id === id ? { ...p, [field]: value } : p),
    })
  }

  function removeAdditionalPerson(id: string) {
    onChange({ ...plan, additionalPersons: additionalPersons.filter(p => p.id !== id) })
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

      {/* Status indicator — only show when targetDate is set */}
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

      {/* Persons Involved */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5">Persons Involved</p>
        <div className="space-y-1.5">
          <PersonField label="Requestor" value={persons.requestor ?? ''} onChange={v => setPerson('requestor', v)} readOnly={readOnly} />
          {isDev ? (
            <>
              <PersonField label="Designer" value={persons.designer ?? ''} onChange={v => setPerson('designer', v)} readOnly={readOnly} />
              <PersonField label="Developer" value={persons.developer ?? ''} onChange={v => setPerson('developer', v)} readOnly={readOnly} />
              <PersonField label="SE" value={persons.se ?? ''} onChange={v => setPerson('se', v)} readOnly={readOnly} />
              <PersonField label="PM" value={persons.pm ?? ''} onChange={v => setPerson('pm', v)} readOnly={readOnly} />
            </>
          ) : (
            <>
              <PersonField label="PIC" value={persons.smartMember ?? ''} onChange={v => setPerson('smartMember', v)} readOnly={readOnly} />
              <PersonField label="SE" value={persons.se ?? ''} onChange={v => setPerson('se', v)} readOnly={readOnly} />
              <PersonField label="PM" value={persons.pm ?? ''} onChange={v => setPerson('pm', v)} readOnly={readOnly} />
            </>
          )}
        </div>
      </div>

      {/* Additional Members */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-xs font-medium text-gray-500">Additional Members</p>
          {!readOnly && (
            <button
              onClick={addAdditionalPerson}
              className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100 transition-colors"
            >
              + Add
            </button>
          )}
        </div>
        {additionalPersons.length === 0 && (
          <p className="text-xs text-gray-400 italic">{readOnly ? 'No additional members.' : 'Add extra team members here.'}</p>
        )}
        <div className="space-y-1">
          {additionalPersons.map(p => (
            <div key={p.id} className="flex items-center gap-1">
              <input
                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-500"
                value={p.role}
                disabled={readOnly}
                onChange={e => updateAdditionalPerson(p.id, 'role', e.target.value)}
                placeholder="Role"
              />
              <input
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-500"
                value={p.name}
                disabled={readOnly}
                onChange={e => updateAdditionalPerson(p.id, 'name', e.target.value)}
                placeholder="Name"
              />
              {!readOnly && (
                <button
                  onClick={() => removeAdditionalPerson(p.id)}
                  className="text-gray-300 hover:text-red-400 text-xs leading-none shrink-0"
                >
                  ✕
                </button>
              )}
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

function PersonField({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}:</span>
      <input className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-500"
        value={value} disabled={readOnly} onChange={e => onChange(e.target.value)} placeholder={label} />
    </div>
  )
}
