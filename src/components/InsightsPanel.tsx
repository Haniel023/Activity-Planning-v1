import type { PlanInsight, ActivityInsight, ActivityInsightStatus, PredictionLabel, ConfidenceLevel } from '../planInsights'

interface Props {
  insight: PlanInsight | null
  planStatus: string
  onClose: () => void
}

// ── Style maps ────────────────────────────────────────────────────────────────

const LABEL_STYLE: Record<PredictionLabel, { bg: string; border: string; text: string; dot: string; readable: string }> = {
  too_early: { bg: 'bg-gray-50',   border: 'border-gray-200',  text: 'text-gray-600',   dot: 'bg-gray-400',   readable: 'Too Early — Not Started Yet' },
  ahead:     { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  dot: 'bg-green-500',  readable: 'Ahead of Schedule' },
  on_track:  { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   dot: 'bg-blue-500',   readable: 'On Track — Smooth Sailing' },
  at_risk:   { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  dot: 'bg-amber-500',  readable: 'At Risk — Slipping Behind' },
  delayed:   { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    dot: 'bg-red-500',    readable: 'Delayed — Needs Attention' },
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  low:    'bg-gray-100 text-gray-500 border-gray-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high:   'bg-green-100 text-green-700 border-green-200',
}

const ACTIVITY_BADGE: Record<ActivityInsightStatus, { bg: string; text: string; label: string }> = {
  not_started: { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not Started' },
  done:        { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Done' },
  on_hold:     { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'On Hold' },
  ahead:       { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Ahead' },
  on_track:    { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'On Track' },
  at_risk:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'At Risk' },
  behind:      { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Behind' },
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Panel header ──────────────────────────────────────────────────────────────

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <div>
          <span className="text-xs font-semibold text-gray-700">Forecast Insights</span>
          <p className="text-[9px] text-gray-400 leading-none mt-0.5">Compares planned vs actual on past dates only</p>
        </div>
      </div>
      <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors p-0.5">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Activity risk row ─────────────────────────────────────────────────────────

function ActivityRiskRow({ a }: { a: ActivityInsight }) {
  const badge = ACTIVITY_BADGE[a.status]
  return (
    <div className="px-3 py-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{a.activityNumber} — {a.activityName}</p>
        {a.missedDays > 0 && (
          <p className="text-[10px] text-gray-400 mt-0.5">{a.missedDays} day(s) behind · {Math.round(a.burnRate * 100)}% pace</p>
        )}
      </div>
      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide border ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InsightsPanel({ insight, planStatus, onClose }: Props) {
  // Not available when plan isn't fully approved + in progress
  if (planStatus !== 'published') {
    return (
      <aside className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">Insights not yet available</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Forecast insights are available once the plan is fully approved and in progress.
          </p>
        </div>
      </aside>
    )
  }

  if (!insight) return null

  const ls = LABEL_STYLE[insight.label]
  const isPositive = insight.label === 'ahead' || insight.label === 'on_track'

  return (
    <aside className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      <PanelHeader onClose={onClose} />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── Summary card ──────────────────────────────────────────────────── */}
        <div className={`rounded-xl p-3 border ${ls.bg} ${ls.border}`}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${ls.dot}`} />
            <span className={`text-xs font-bold ${ls.text}`}>{ls.readable}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Burn Rate</p>
              <p className={`text-2xl font-bold leading-none ${ls.text}`}>
                {Math.round(insight.overallBurnRate * 100)}%
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">of planned pace</p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-wider ${CONFIDENCE_STYLE[insight.confidence]}`}>
              {insight.confidence} confidence
            </span>
          </div>
        </div>

        {/* ── Projected finish ──────────────────────────────────────────────── */}
        {insight.projectedFinishDate && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Projected Finish</p>
            <p className="text-sm font-semibold text-gray-800">{formatDate(insight.projectedFinishDate)}</p>
            {insight.targetDate ? (
              insight.daysVariance === 0 ? (
                <p className="text-xs font-medium text-blue-600">On target</p>
              ) : insight.daysVariance > 0 ? (
                <p className="text-xs font-medium text-green-600">
                  {insight.daysVariance} day(s) early vs target
                </p>
              ) : (
                <p className="text-xs font-medium text-red-600">
                  {Math.abs(insight.daysVariance)} day(s) late vs target
                </p>
              )
            ) : (
              <p className="text-[10px] text-gray-400">No target date set</p>
            )}
            {insight.targetDate && (
              <p className="text-[10px] text-gray-400">Target: {formatDate(insight.targetDate)}</p>
            )}
            {insight.totalExtraDaysNeeded > 0 && (
              <p className="text-[10px] text-amber-600 font-medium">
                +{insight.totalExtraDaysNeeded} extra working day(s) needed beyond current schedule
              </p>
            )}
          </div>
        )}

        {/* ── On track / ahead — no concerns ────────────────────────────────── */}
        {isPositive && insight.activitiesAtRisk.length === 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center space-y-1">
            <p className="text-lg">✓</p>
            <p className="text-xs font-semibold text-green-700">All activities proceeding as planned</p>
            <p className="text-[10px] text-green-600">No interventions required at this time.</p>
          </div>
        )}

        {/* ── Activities needing attention ───────────────────────────────────── */}
        {insight.activitiesAtRisk.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                Needs Attention
              </p>
              <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">
                {insight.activitiesAtRisk.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {insight.activitiesAtRisk.map(a => (
                <ActivityRiskRow key={a.activityId} a={a} />
              ))}
            </div>
          </div>
        )}

        {/* ── Recovery options ───────────────────────────────────────────────── */}
        {insight.recoveryOptions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2.5">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Recovery Options</p>
            <ul className="space-y-2">
              {insight.recoveryOptions.map((opt, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold shrink-0 mt-0.5 text-xs">·</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">{opt.label}</p>
                    <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">{opt.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Too early state ────────────────────────────────────────────────── */}
        {insight.label === 'too_early' && (() => {
          const hasAnyActual = insight.activityInsights.some(a => a.pastActualDays > 0 || a.totalPlanDays > 0)
          const hasFuturePlans = insight.totalAllPlanDays > 0
          return (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center space-y-1.5">
              {hasFuturePlans ? (
                <>
                  <p className="text-xs font-medium text-gray-600">Schedule not started yet</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Your plan days are all in the future. Forecasting activates once today's date reaches a scheduled plan day and you mark actual work on it.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-600">No plan days to compare</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Plot plan days on the Gantt first, then mark actual work as you go.
                  </p>
                </>
              )}
              <p className="text-[9px] text-indigo-400 font-medium mt-1">
                Today's scheduled work has until end of day. If unactual'd by tomorrow, it will show as behind.
              </p>
            </div>
          )
        })()}

        {/* ── Low confidence notice ──────────────────────────────────────────── */}
        {insight.confidence === 'low' && insight.label !== 'too_early' && (
          <p className="text-[10px] text-gray-400 text-center px-2 leading-relaxed">
            Low confidence — less than 20% of plan days have passed. Predictions improve as more actual work is recorded.
          </p>
        )}

        {/* ── Footer: data summary ───────────────────────────────────────────── */}
        <div className="text-[10px] text-gray-300 text-center pt-1">
          {insight.totalPastPlanDays} of {insight.totalAllPlanDays} plan days are in the past
        </div>

      </div>
    </aside>
  )
}
