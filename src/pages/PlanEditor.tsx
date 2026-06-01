import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ActivityPlan, SelfCheckTR } from '../types'
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
  for_revision: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'For Revision — an approver sent this back. Edit and re-publish when ready.' },
  rejected:     { bg: 'bg-red-50 border-red-200',     text: 'text-red-700',   label: 'Rejected — this plan was rejected. Rework and re-publish.' },
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showVersionUp, setShowVersionUp] = useState(false)
  const [versionUpReason, setVersionUpReason] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmRepublish, setConfirmRepublish] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const dirtyRef = useRef(false)

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

  const isLocked = plan?.status === 'published'
  const isForRevision = plan?.status === 'for_revision' || plan?.status === 'rejected'
  const allApproved = plan ? ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
    .every(k => !!(plan.approvals as any)[k]?.signatureImage) : false
  const partialEdit = isLocked && allApproved

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
    if (!plan.approvals.preparedBy.signatureImage) return 'PIC must upload their signature in the Approval section before publishing.'
    const hasCheck1 = selfCheck.items.some(i => i.selfCheck1.trim())
    if (!hasCheck1) return 'Self Check / TR: at least one item must have a 1st Round result before publishing.'
    return null
  }

  // Auto-fill selfCheckPIC and trPIC from persons data before publishing
  function prepareSelfCheck(sc: SelfCheckTR): SelfCheckTR {
    if (!plan) return sc
    const picName = autoFillNameForRole('PIC', plan.type, plan.persons, plan.personsList)
    const trName = autoFillNameForRole('PROJECT LEADER', plan.type, plan.persons, plan.personsList) || autoFillNameForRole('SUPERVISOR', plan.type, plan.persons, plan.personsList)
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
      setPlan(prev => prev ? { ...prev, status: 'published', documentVersion: newVersion } : prev)
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
      // Version up unlocks plan for editing (status → for_revision on server)
      setPlan(prev => prev ? { ...prev, documentVersion: newVersion, status: 'for_revision' } : prev)
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
          title="Publish Activity Plan"
          message="Once published, this plan will be locked for editing. Share the view link with approvers to collect signatures."
          confirmLabel={publishing ? 'Publishing...' : 'Publish'}
          onConfirm={doPublish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
      {confirmRepublish && (
        <ConfirmModal
          title="Re-Publish Activity Plan"
          message="Version will be incremented and the plan will be locked again for approvals."
          confirmLabel={publishing ? 'Publishing...' : 'Re-Publish'}
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
              /* Published — Version Up, Share, (Save Progress when all approved) */
              <>
                {partialEdit && (
                  <button onClick={handleSaveProgress} disabled={saving}
                    className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${saved ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}>
                    {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Progress'}
                  </button>
                )}
                <button onClick={() => setShowVersionUp(true)} className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  Version Up
                </button>
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
                    Publish
                  </button>
                )}
                {isForRevision && (
                  <button onClick={handleRepublishClick} disabled={publishing} className="text-xs font-medium px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-sm disabled:opacity-50">
                    Re-Publish
                  </button>
                )}
              </>
            )}

            {/* Updates drawer toggle — only when published */}
            {isLocked && (
              <button
                onClick={() => setShowUpdates(v => !v)}
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

            {/* Export PDF */}
            <button onClick={handleExport} disabled={exporting} className={`flex items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shadow-sm ${exporting ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {exporting ? 'Exporting...' : 'PDF'}
            </button>

            {/* Export Excel */}
            <button onClick={handleExportExcel} disabled={exportingExcel} className={`flex items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shadow-sm ${exportingExcel ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {exportingExcel ? 'Exporting...' : 'Excel'}
            </button>
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
                  <ApprovalSection plan={plan} onChange={handlePlanChange} readOnly={isLocked} />
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
