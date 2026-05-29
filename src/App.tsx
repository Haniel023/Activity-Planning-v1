import { useState, useCallback } from 'react'
import type { ActivityPlan, PlanType, SelfCheckTR } from './types'
import { createDefaultPlan, createDefaultSelfCheck } from './utils'
import { exportToExcel } from './exporter'
import LandingPage from './components/LandingPage'
import PlanHeader from './components/PlanHeader'
import ApprovalSection from './components/ApprovalSection'
import ActivityTable from './components/ActivityTable'
import SelfCheckTRView from './components/SelfCheckTRView'

type Tab = 'plan' | 'selfcheck'
type SideSection = 'approval' | 'details'

export default function App() {
  const [plan, setPlan] = useState<ActivityPlan | null>(null)
  const [selfCheck, setSelfCheck] = useState<SelfCheckTR | null>(null)
  const [tab, setTab] = useState<Tab>('plan')
  const [sideSection, setSideSection] = useState<SideSection>('approval')
  const [exporting, setExporting] = useState(false)

  function handleSelectType(type: PlanType) {
    setPlan(createDefaultPlan(type))
    setSelfCheck(createDefaultSelfCheck())
    setTab('plan')
  }

  function handleBack() {
    if (!confirm('Start over? Your current plan will be lost.')) return
    setPlan(null)
    setSelfCheck(null)
  }

  const handleExport = useCallback(async () => {
    if (!plan || !selfCheck || exporting) return
    setExporting(true)
    try { await exportToExcel(plan, selfCheck) } finally { setExporting(false) }
  }, [plan, selfCheck, exporting])

  if (!plan || !selfCheck) {
    return <LandingPage onSelect={handleSelectType} />
  }

  const isDev = plan.type === 'development'

  return (
    // Full viewport, no outer scroll
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-2 flex items-center gap-3">
          <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDev ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {isDev ? 'Development' : 'Support'}
          </span>
          <span className="text-gray-700 font-medium text-sm truncate flex-1">
            {plan.title || <span className="text-gray-400 italic">Untitled Plan</span>}
          </span>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 transition-colors ${tab === 'plan' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setTab('plan')}
            >Activity Plan</button>
            <button
              className={`px-3 py-1.5 transition-colors ${tab === 'selfcheck' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setTab('selfcheck')}
            >Self Check / TR</button>
          </div>
          <button
            onClick={handleExport}
            className={`flex items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shadow-sm ${exporting ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            disabled={exporting}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + main ─────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {tab === 'plan' && (
          <>
            {/* ── Left Sidebar ─────────────────────────────────────────── */}
            <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
              {/* Sidebar tab switcher */}
              <div className="flex border-b border-gray-200 flex-shrink-0">
                <button
                  className={`flex-1 text-xs py-2 font-medium transition-colors ${sideSection === 'approval' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setSideSection('approval')}
                >Approval</button>
                <button
                  className={`flex-1 text-xs py-2 font-medium transition-colors ${sideSection === 'details' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setSideSection('details')}
                >Plan Details</button>
              </div>

              {/* Sidebar content — scrollable independently */}
              <div className="flex-1 overflow-y-auto p-3">
                {sideSection === 'approval' && (
                  <ApprovalSection plan={plan} onChange={setPlan} />
                )}
                {sideSection === 'details' && (
                  <PlanHeader plan={plan} onChange={setPlan} />
                )}
              </div>
            </aside>

            {/* ── Main: Activity Table filling all remaining space ──────── */}
            <main className="flex-1 flex flex-col overflow-hidden p-3">
              <ActivityTable plan={plan} onChange={setPlan} />
            </main>
          </>
        )}

        {tab === 'selfcheck' && (
          <main className="flex-1 overflow-auto p-4">
            <SelfCheckTRView data={selfCheck} onChange={setSelfCheck} />
          </main>
        )}
      </div>
    </div>
  )
}
