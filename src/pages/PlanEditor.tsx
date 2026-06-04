import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ActivityPlan, SelfCheckTR, CompanyHoliday } from '../types'
import { diffPlans, type DiffSection } from '../planDiff'
import { computeInsights } from '../planInsights'
import InsightsPanel from '../components/InsightsPanel'
import { createDefaultSelfCheck, autoFillNameForRole } from '../utils'
import { exportToPDF } from '../pdfExporter'
import { exportToExcel } from '../exporter'
import { api } from '../api'
import PlanHeader from '../components/PlanHeader'
import ApprovalSection from '../components/ApprovalSection'
import ActivityTable from '../components/ActivityTable'
import SelfCheckTRView from '../components/SelfCheckTRView'
import UpdatesLog from '../components/UpdatesLog'
import ConfirmModal from '../components/ConfirmModal'

type Tab = 'plan' | 'selfcheck'
type SideSection = 'approval' | 'details'

const DOC_STATUS_BANNER: Record<string, { bg: string; text: string; label: string }> = {
  ongoing_approval: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', label: 'Submitted for Approval — awaiting signatures from approvers. Share the view link.' },
  for_revision:     { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  label: 'For Revision — an approver sent this back. Edit and re-submit when ready.' },
  cancelled:        { bg: 'bg-gray-50 border-gray-300',     text: 'text-gray-600',   label: 'Cancelled — this project has been cancelled.' },
  rejected:         { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',    label: 'Rejected — this plan was rejected. Rework and re-submit.' },
}

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [plan, setPlan] = useState<ActivityPlan | null>(null)
  const [selfCheck, setSelfCheck] = useState<SelfCheckTR | null>(null)
  const [tab, setTab] = useState<Tab>('plan')
  const [sideSection, setSideSection] = useState<SideSection>('approval')
  const [showUpdates, setShowUpdates] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showVersionUp, setShowVersionUp] = useState(false)
  const [versionUpReason, setVersionUpReason] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmRepublish, setConfirmRepublish] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  // ── Version diff modal ───────────────────────────────────────────────────────
  const [diffModal, setDiffModal] = useState<{ version: string; sections: DiffSection[] } | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // ── Predictive insights ───────────────────────────────────────────────────────
  const [showInsights, setShowInsights] = useState(false)
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([])
  useEffect(() => { api.listCompanyHolidays().then(setCompanyHolidays).catch(() => {}) }, [])
  const insight = useMemo(
    () => plan ? computeInsights(plan, companyHolidays) : null,
    [plan, companyHolidays]
  )

  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  // Load plan on mount
  useEffect(() => {
    if (!id) { navigate('/'); return }
    setLoading(true)
    api.getPlan(id)
      .then(({ plan: p, selfCheck: sc }) => {
        setPlan(p)
        setSelfCheck(sc ?? createDefaultSelfCheck())
        setLoading(false)
      })
      .catch(() => { alert('Plan not found.'); navigate('/') })
  }, [id, navigate])

  // Dynamic browser tab title
  useEffect(() => {
    if (!plan) return
    document.title = `${plan.title || 'Untitled Plan'} — Activity Planning`
    return () => { document.title = 'Activity Planning' }
  }, [plan?.title])

  function handlePlanChange(next: ActivityPlan) {
    setPlan(next)
    dirtyRef.current = true
    setSaved(false)
  }

  const isLocked = !!plan && ['published', 'ongoing_approval', 'cancelled'].includes(plan.status)
  const isForRevision = plan?.status === 'for_revision' || plan?.status === 'rejected'
  const allApproved = plan
    ? ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2'].every(k => !!(plan.approvals as any)[k]?.signatureImage)
      && (!plan.requiresDeptManager || !!(plan.approvals as any).approvedBy3?.signatureImage)
    : false
  const partialEdit = plan?.status === 'published' && allApproved

  async function handleSave() {
    if (!plan || !selfCheck || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.updatePlan(plan.id, plan, selfCheck)
      dirtyRef.current = false
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Validate pre-publish requirements
  function validateBeforePublish(): string | null {
    if (!plan || !selfCheck) return null
    if (!plan.title.trim()) return 'Please enter a plan title.'
    if (!plan.approvals.preparedBy.signatureImage) return 'PIC must upload their signature in the Approval section before submitting.'
    const hasCheck1 = selfCheck.items.some(i => i.selfCheck1.trim())
    if (!hasCheck1) return 'Self Check / TR: at least one item must have a 1st Round result before submitting.'
    return null
  }

  // Auto-fill selfCheckPIC and trPIC from persons data before publishing
  function prepareSelfCheck(sc: SelfCheckTR): SelfCheckTR {
    if (!plan) return sc
    const picName = autoFillNameForRole('PIC', plan.type, plan.persons, plan.personsList, plan.stakeholders)
    const trName = autoFillNameForRole('PROJECT LEADER', plan.type, plan.persons, plan.personsList, plan.stakeholders) || autoFillNameForRole('SUPERVISOR', plan.type, plan.persons, plan.personsList, plan.stakeholders)
    return {
      ...sc,
      selfCheckPIC: sc.selfCheckPIC || picName,
      trPIC: sc.trPIC || trName,
    }
  }

  async function doPublish() {
    if (!plan || !selfCheck || publishing) return
    setPublishing(true)
    setPublishError(null)
    try {
      const prepared = prepareSelfCheck(selfCheck)
      setSelfCheck(prepared)
      await api.updatePlan(plan.id, plan, prepared)
      await api.publishPlan(plan.id)
      setPlan(prev => prev ? { ...prev, status: 'published' } : prev)
      dirtyRef.current = false
    } catch (e) {
      setPublishError((e as Error).message)
    } finally {
      setPublishing(false)
      setConfirmPublish(false)
    }
  }

  async function doRepublish() {
    if (!plan || !selfCheck || publishing) return
    setPublishing(true)
    try {
      const prepared = prepareSelfCheck(selfCheck)
      setSelfCheck(prepared)
      await api.updatePlan(plan.id, plan, prepared)
      const { newVersion } = await api.republish(plan.id, plan.approvals.preparedBy.name || '')
      const today = new Date().toISOString().slice(0, 10)
      setPlan(prev => prev ? {
        ...prev,
        status: 'ongoing_approval',
        documentVersion: newVersion,
        versionHistory: [
          ...(prev.versionHistory ?? []),
          { version: newVersion, date: today, reason: 'Re-submitted for approval after revision', by: prev.approvals.preparedBy.name || '' },
        ],
      } : prev)
      dirtyRef.current = false
    } catch (e) {
      alert('Re-publish failed: ' + (e as Error).message)
    } finally {
      setPublishing(false)
      setConfirmRepublish(false)
    }
  }

  function handlePublishClick() {
    const err = validateBeforePublish()
    if (err) { setPublishError(err); return }
    setPublishError(null)
    setConfirmPublish(true)
  }

  function handleRepublishClick() {
    const err = validateBeforePublish()
    if (err) { setPublishError(err); return }
    setPublishError(null)
    setConfirmRepublish(true)
  }

  async function handleVersionUp() {
    if (!plan) return
    if (!versionUpReason.trim()) { alert('Please enter a reason for the version increment.'); return }
    try {
      const { newVersion } = await api.versionUp(plan.id, versionUpReason, plan.approvals.preparedBy.name || '')
      const today = new Date().toISOString().slice(0, 10)
      setPlan(prev => prev ? {
        ...prev,
        documentVersion: newVersion,
        status: 'for_revision',
        versionHistory: [
          ...(prev.versionHistory ?? []),
          { version: newVersion, date: today, reason: versionUpReason, by: prev.approvals.preparedBy.name || '' },
        ],
      } : prev)
      setShowVersionUp(false)
      setVersionUpReason('')
    } catch (e) {
      alert('Version up failed: ' + (e as Error).message)
    }
  }

  const handleExport = useCallback(async () => {
    if (!plan || !selfCheck || exporting) return
    setExporting(true)
    try { await exportToPDF(plan, selfCheck) } finally { setExporting(false) }
  }, [plan, selfCheck, exporting])

  const handleExportExcel = useCallback(async () => {
    if (!plan || !selfCheck || exportingExcel) return
    setExportingExcel(true)
    try { await exportToExcel(plan, selfCheck) } finally { setExportingExcel(false) }
  }, [plan, selfCheck, exportingExcel])

  async function handleSaveProgress() {
    if (!plan || saving) return
    setSaving(true)
    try {
      await api.saveProgress(plan.id, plan.activities)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/view/${plan!.id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => alert('View link copied to clipboard!'))
    } else {
      prompt('Copy this link to share with approvers:', url)
    }
  }

  async function openDiff(targetVersion: string) {
    if (!plan) return
    setDiffLoading(true)
    try {
      const snapshots = await api.listVersionSnapshots(plan.id)
      const idx = snapshots.findIndex(s => s.version === targetVersion)
      const [newer, older] = await Promise.all([
        api.getVersionSnapshot(plan.id, targetVersion),
        idx > 0 ? api.getVersionSnapshot(plan.id, snapshots[idx - 1].version) : Promise.resolve(null),
      ])
      if (!older) {
        setDiffModal({ version: targetVersion, sections: [{ label: 'Initial version — no previous snapshot to compare', changes: [] }] })
      } else {
        setDiffModal({ version: targetVersion, sections: diffPlans(older.data, newer.data) })
      }
    } catch {
      alert('Could not load version snapshots.')
    } finally {
      setDiffLoading(false)
    }
  }

  function handleBack() {
    if (dirtyRef.current && !confirm('You have unsaved changes. Leave without saving?')) return
    navigate('/')
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-gray-500 text-sm">Loading plan...</span>
      </div>
    )
  }

  if (!plan || !selfCheck) return null

  const isDev = plan.type === 'development'
  const banner = DOC_STATUS_BANNER[plan.status]

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">

      {/* Confirm modals */}
      {confirmPublish && (
        <ConfirmModal
          title="Submit for Approval"
          message="The plan will be locked for editing and sent for approval. Share the view link with approvers to collect signatures."
          confirmLabel={publishing ? 'Submitting...' : 'Submit'}
          onConfirm={doPublish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
      {confirmRepublish && (
        <ConfirmModal
          title="Re-Submit for Approval"
          message="Version will be incremented and the plan will be re-submitted for approval."
          confirmLabel={publishing ? 'Submitting...' : 'Re-Submit'}
          onConfirm={doRepublish}
          onCancel={() => setConfirmRepublish(false)}
        />
      )}

      {/* Version Up modal */}
      {showVersionUp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Version Up (Major)</h2>
            <p className="text-xs text-gray-500">
              Current: v{plan.documentVersion} → will become v{parseInt(plan.documentVersion.split('.')[0], 10) + 1}.00
              {isLocked && <span className="block mt-1 text-amber-600 font-medium">This will also unlock the plan for editing.</span>}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <input
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Major scope change"
                value={versionUpReason}
                onChange={e => setVersionUpReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVersionUp()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowVersionUp(false); setVersionUpReason('') }} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              <button onClick={handleVersionUp} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Version diff modal */}
      {diffModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setDiffModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Changes in v{diffModal.version}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Compared to the previous version snapshot</p>
              </div>
              <button onClick={() => setDiffModal(null)} className="text-gray-300 hover:text-gray-500 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {diffModal.sections.map((sec, i) => (
                <div key={i}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{sec.label}</p>
                  {sec.changes.length === 0
                    ? <p className="text-xs text-gray-400 italic">—</p>
                    : <ul className="space-y-1">
                        {sec.changes.map((c, j) => (
                          <li key={j} className="text-xs text-gray-700 flex items-start gap-2">
                            <span className="text-blue-400 shrink-0 mt-0.5">·</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
          <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← Back</button>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${isDev ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {isDev ? 'Development' : 'Support'}
          </span>
          <span className="text-gray-700 font-medium text-sm truncate flex-1 min-w-0">
            {plan.title || <span className="text-gray-400 italic">Untitled Plan</span>}
          </span>
          <span className="text-xs text-gray-400 shrink-0">v{plan.documentVersion}</span>

          {/* Tab switcher */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs shrink-0">
            <button className={`px-3 py-1.5 transition-colors ${tab === 'plan' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`} onClick={() => setTab('plan')}>Activity Plan</button>
            <button className={`px-3 py-1.5 transition-colors ${tab === 'selfcheck' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`} onClick={() => setTab('selfcheck')}>Self Check / TR</button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {publishError && <span className="text-xs text-red-500 max-w-48 truncate" title={publishError}>{publishError}</span>}
            {saveError && <span className="text-xs text-red-500">{saveError}</span>}

            {isLocked ? (
              /* Locked (ongoing_approval / published / cancelled) */
              <>
                {partialEdit && (
                  <button onClick={handleSaveProgress} disabled={saving}
                    className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${saved ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}>
                    {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Progress'}
                  </button>
                )}
                {plan.status !== 'cancelled' && (
                  <button onClick={() => setShowVersionUp(true)} className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                    Version Up
                  </button>
                )}
                <button onClick={copyShareLink} className="text-xs font-medium px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  Share
                </button>
              </>
            ) : (
              /* Draft / For Revision / Rejected — full editing buttons */
              <>
                <button onClick={handleSave} disabled={saving} className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${saved ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}>
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
                </button>
                <button onClick={() => setShowVersionUp(true)} className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  Version Up
                </button>
                {plan.status === 'draft' && (
                  <button onClick={handlePublishClick} disabled={publishing} className="text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm disabled:opacity-50">
                    Submit
                  </button>
                )}
                {isForRevision && (
                  <button onClick={handleRepublishClick} disabled={publishing} className="text-xs font-medium px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-sm disabled:opacity-50">
                    Re-Submit
                  </button>
                )}
              </>
            )}

            {/* Insights toggle — only when published */}
            {plan.status === 'published' && (
              <button
                onClick={() => { setShowInsights(v => !v); setShowUpdates(false) }}
                title="Toggle forecast insights"
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${showInsights ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Insights
                {insight && (insight.label === 'delayed' || insight.label === 'at_risk') && !showInsights && (
                  <span className={`w-1.5 h-1.5 rounded-full ${insight.label === 'delayed' ? 'bg-red-400' : 'bg-amber-400'}`} />
                )}
              </button>
            )}

            {/* Updates drawer toggle — only when published (fully approved) */}
            {plan.status === 'published' && (
              <button
                onClick={() => { setShowUpdates(v => !v); setShowInsights(false) }}
                title="Toggle updates panel"
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${showUpdates ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Updates
                {allApproved && !showUpdates && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
              </button>
            )}

            {/* Split export button — default PDF, dropdown for PDF/Excel */}
            <div ref={exportMenuRef} className="relative flex rounded-lg overflow-visible shadow-sm shrink-0">
              <button
                onClick={handleExport}
                disabled={exporting || exportingExcel}
                className={`flex items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded-l-lg transition-colors ${(exporting || exportingExcel) ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? 'Exporting…' : 'Export'}
              </button>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting || exportingExcel}
                title="Choose export format"
                className={`flex items-center px-2 py-2 rounded-r-lg border-l border-emerald-500/40 transition-colors text-white ${(exporting || exportingExcel) ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden min-w-36">
                  <button
                    onClick={() => { handleExport(); setShowExportMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-700 hover:bg-emerald-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PDF
                  </button>
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => { handleExportExcel(); setShowExportMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-700 hover:bg-teal-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Export Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status banner for for_revision / rejected */}
        {banner && (
          <div className={`px-4 py-1.5 border-t text-xs flex items-center gap-2 ${banner.bg} ${banner.text}`}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {banner.label}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'plan' && (
          <>
            {/* Sidebar */}
            <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
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
              <div className="flex-1 overflow-y-auto p-3">
                {sideSection === 'approval' && (
                  <>
                    <ApprovalSection plan={plan} onChange={handlePlanChange} readOnly={isLocked} />
                    {plan.versionHistory && plan.versionHistory.length > 0 && (
                      <div className="mt-3 border border-gray-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Version History</p>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                          {[...plan.versionHistory].reverse().map((v, i) => (
                            <div key={i} className="border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between gap-1">
                                <div>
                                  <span className="text-[10px] font-semibold text-gray-700">v{v.version}</span>
                                  <span className="text-[10px] text-gray-400 ml-1">{v.date}</span>
                                </div>
                                <button
                                  onClick={() => openDiff(v.version)}
                                  disabled={diffLoading}
                                  title="View changes in this version"
                                  className="text-[9px] text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40 shrink-0"
                                >
                                  {diffLoading ? '…' : 'Changes'}
                                </button>
                              </div>
                              {v.reason && v.reason !== 'N/A' && <p className="text-[10px] text-gray-500 mt-0.5">{v.reason}</p>}
                              {v.by && <p className="text-[10px] text-gray-400">by {v.by}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {sideSection === 'details' && (
                  <PlanHeader plan={plan} onChange={handlePlanChange} readOnly={isLocked} />
                )}
              </div>
            </aside>

            {/* Main table */}
            <main className="flex-1 flex flex-col overflow-hidden p-3">
              <ActivityTable plan={plan} onChange={handlePlanChange} readOnly={isLocked && !partialEdit} partialEdit={partialEdit} />
            </main>

            {/* Right insights drawer */}
            {showInsights && tab === 'plan' && (
              <InsightsPanel
                insight={insight}
                planStatus={plan.status}
                onClose={() => setShowInsights(false)}
              />
            )}

            {/* Right updates drawer */}
            {showUpdates && (
              <aside className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-700">Progress Updates</span>
                  </div>
                  <button
                    onClick={() => setShowUpdates(false)}
                    className="text-gray-300 hover:text-gray-500 transition-colors p-0.5"
                    title="Close panel"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-hidden p-3">
                  <UpdatesLog planId={plan.id} canPost={allApproved} activities={plan.activities} />
                </div>
              </aside>
            )}
          </>
        )}

        {tab === 'selfcheck' && (
          <main className="flex-1 overflow-auto p-4">
            <SelfCheckTRView data={selfCheck} onChange={isLocked ? () => {} : setSelfCheck} readOnly={isLocked} />
          </main>
        )}
      </div>
    </div>
  )
}
