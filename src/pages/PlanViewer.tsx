import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { ActivityPlan, ApproverSlot, SelfCheckTR } from '../types'
import { autoFillNameForRole, createDefaultSelfCheck } from '../utils'
import { api } from '../api'
import ActivityTable from '../components/ActivityTable'
import PlanHeader from '../components/PlanHeader'
import SelfCheckTRView from '../components/SelfCheckTRView'

type ViewerRole = 'PIC' | 'PROJECT LEADER' | 'SUPERVISOR' | 'MANAGER'
type SlotKey = 'preparedBy' | 'reviewedBy' | 'approvedBy1' | 'approvedBy2'
type Tab = 'plan' | 'selfcheck'

const ROLE_TO_SLOT: Record<ViewerRole, SlotKey> = {
  'PIC': 'preparedBy',
  'PROJECT LEADER': 'reviewedBy',
  'SUPERVISOR': 'approvedBy1',
  'MANAGER': 'approvedBy2',
}

const ROLE_OPTIONS: ViewerRole[] = ['PIC', 'PROJECT LEADER', 'SUPERVISOR', 'MANAGER']

const STATUS_CHIP: Record<string, string> = {
  draft:        'bg-gray-100 text-gray-600',
  published:    'bg-blue-100 text-blue-700',
  for_revision: 'bg-amber-100 text-amber-700',
  rejected:     'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  draft:        'Draft',
  published:    'Published',
  for_revision: 'For Revision',
  rejected:     'Rejected',
}

export default function PlanViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [plan, setPlan] = useState<ActivityPlan | null>(null)
  const [selfCheck, setSelfCheck] = useState<SelfCheckTR | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<ViewerRole | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [tab, setTab] = useState<Tab>('plan')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [draggingOver, setDraggingOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Tracks which slots have been confirmed saved to the server — prevents premature locking from local signature upload
  const [approverActed, setApproverActed] = useState<Set<SlotKey>>(new Set())

  useEffect(() => {
    if (!id) { navigate('/'); return }
    api.getPlan(id)
      .then(({ plan: p, selfCheck: sc }) => {
        setPlan(p)
        setSelfCheck(sc ?? createDefaultSelfCheck())
        setLoading(false)
        // Pre-mark slots that already have signatures on load
        const alreadySigned = (['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2'] as SlotKey[])
          .filter(k => !!p.approvals[k]?.signatureImage)
        if (alreadySigned.length > 0) setApproverActed(new Set(alreadySigned))
        // Show role selector on first open
        const storedRole = sessionStorage.getItem(`viewer-role-${id}`) as ViewerRole | null
        if (storedRole && ROLE_OPTIONS.includes(storedRole)) {
          setRole(storedRole)
        } else {
          setShowRoleModal(true)
        }
      })
      .catch(() => { alert('Plan not found.'); navigate('/') })
  }, [id, navigate])

  // Dynamic browser tab title
  useEffect(() => {
    if (!plan) return
    document.title = `${plan.title || 'Untitled Plan'} — View — Activity Planning`
    return () => { document.title = 'Activity Planning' }
  }, [plan?.title])

  function selectRole(r: ViewerRole) {
    setRole(r)
    sessionStorage.setItem(`viewer-role-${id}`, r)
    setShowRoleModal(false)
    if (plan) {
      // Auto-fill name if slot name is empty
      const slotKey = ROLE_TO_SLOT[r]
      const slot = plan.approvals[slotKey]
      if (!slot.name && r !== 'PIC') {
        const autoName = autoFillNameForRole(r, plan.type, plan.persons)
        if (autoName) {
          updateSlot(slotKey, { name: autoName })
        }
      }
    }
  }

  function updateSlot(slotKey: SlotKey, changes: Partial<ApproverSlot>) {
    setPlan(prev => {
      if (!prev) return prev
      return {
        ...prev,
        approvals: {
          ...prev.approvals,
          [slotKey]: { ...prev.approvals[slotKey], ...changes },
        },
      }
    })
  }

  async function handleSaveApproval() {
    if (!plan || !slotKey || saving) return
    setSaving(true)
    try {
      await api.updateApprovals(plan.id, plan.approvals)
      // Mark slot as acted on AFTER confirmed server save — this is what locks it
      setApproverActed(prev => new Set([...prev, slotKey]))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert('Failed to save: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendForRevision() {
    if (!plan || !role || !revisionReason.trim()) {
      alert('Please enter a reason for revision.')
      return
    }
    try {
      await api.sendForRevision(plan.id, revisionReason, plan.approvals[ROLE_TO_SLOT[role]].name || role)
      setPlan(prev => prev ? { ...prev, status: 'for_revision' } : prev)
      setShowRevisionModal(false)
      setRevisionReason('')
      alert('Plan sent for revision. The PIC will be notified to make changes and re-publish.')
    } catch (e) {
      alert('Failed: ' + (e as Error).message)
    }
  }

  async function handleReject() {
    if (!plan || !role || !rejectReason.trim()) {
      alert('Please enter a reason for rejection.')
      return
    }
    try {
      await api.rejectPlan(plan.id, rejectReason, plan.approvals[ROLE_TO_SLOT[role]].name || role)
      setPlan(prev => prev ? { ...prev, status: 'rejected' } : prev)
      setShowRejectModal(false)
      setRejectReason('')
      alert('Plan has been rejected. The PIC will be notified to rework and re-publish.')
    } catch (e) {
      alert('Failed: ' + (e as Error).message)
    }
  }

  // Signature image handling
  function handleSignatureFile(file: File) {
    if (!role) return
    const slotKey = ROLE_TO_SLOT[role]
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      updateSlot(slotKey, { signatureImage: dataUrl, approvedAt: new Date().toISOString() })
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleSignatureFile(file)
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
  const slotKey = role ? ROLE_TO_SLOT[role] : null
  const isApprover = role && role !== 'PIC'
  const canAction = isApprover && plan.status === 'published'
  const allApproved = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2']
    .every(k => !!(plan.approvals as any)[k]?.signatureImage)
  const picPartialEdit = role === 'PIC' && plan.status === 'published' && allApproved

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">

      {/* Role selector modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Select Your Role</h2>
            <p className="text-xs text-gray-400 mb-5">Choose how you're viewing this activity plan.</p>
            <div className="space-y-2">
              {ROLE_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => selectRole(r)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{r}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {r === 'PIC' ? 'View the plan (read-only)' :
                     r === 'PROJECT LEADER' ? 'Review and sign the plan' :
                     r === 'SUPERVISOR' ? 'Approve or send for revision' :
                     'Final approval or send for revision'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* For Revision modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">For Revision</h2>
            <p className="text-xs text-gray-500">Describe what needs to be corrected. The PIC will be able to edit the plan and re-publish.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <textarea
                autoFocus
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="e.g. Please update the timeline for Phase 3..."
                value={revisionReason}
                onChange={e => setRevisionReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRevisionModal(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              <button onClick={handleSendForRevision} className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-2 rounded-lg">For Revision</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-sm font-semibold text-red-700">Reject Plan</h2>
            <p className="text-xs text-gray-500">This plan will be marked as rejected. The PIC must rework and re-publish it.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason for rejection</label>
              <textarea
                autoFocus
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                placeholder="e.g. Activity plan does not meet requirements..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRejectModal(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              <button onClick={handleReject} className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg">Reject Plan</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-2 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← Dashboard</button>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDev ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {isDev ? 'Development' : 'Support'}
          </span>
          <span className="text-gray-700 font-medium text-sm truncate flex-1">
            {plan.title || <span className="text-gray-400 italic">Untitled Plan</span>}
          </span>
          <span className="text-xs text-gray-400">v{plan.documentVersion}</span>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[plan.status] || ''}`}>
            {STATUS_LABEL[plan.status] || plan.status}
          </span>

          {/* Tab switcher */}
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

          {/* Save progress button for PIC when fully approved */}
          {picPartialEdit && (
            <button
              onClick={async () => {
                setSaving(true)
                try { await api.saveProgress(plan.id, plan.activities); setSaved(true); setTimeout(() => setSaved(false), 2500) }
                catch (e) { alert('Save failed: ' + (e as Error).message) }
                finally { setSaving(false) }
              }}
              disabled={saving}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${saved ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Progress'}
            </button>
          )}

          {/* Role badge + change */}
          {role && (
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1">
              <span className="text-xs text-gray-500 font-medium">{role}</span>
              <button onClick={() => setShowRoleModal(true)} className="text-[10px] text-gray-400 hover:text-gray-600 underline">change</button>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'plan' && (
          <>
            {/* Approval sidebar */}
            <aside className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
              <div className="border-b border-gray-200 px-3 py-2 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-600">Approval</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">

                {/* Sequential approval order */}
                {(['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2'] as SlotKey[]).map((key, idx) => {
                  const slot = plan.approvals[key]
                  const isMySlot = key === slotKey && isApprover
                  const isSigned2 = !!slot.signatureImage

                  // Sequential: previous slot must be signed before this one is actionable
                  const prevKey = (['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2'] as SlotKey[])[idx - 1]
                  const prevSigned = idx === 0 || !!plan.approvals[prevKey]?.signatureImage

                  // Lock only after confirmed server save, or when plan status changed (revision/reject)
                  const isActedOn = approverActed.has(key) || plan.status === 'for_revision' || plan.status === 'rejected'

                  // ── Read-only summary (other slots, or locked, or PIC's slot) ──
                  if (!isMySlot || isActedOn) {
                    const statusColor = isSigned2
                      ? 'border-green-200 bg-green-50'
                      : !prevSigned
                        ? 'border-gray-100 bg-gray-50 opacity-60'
                        : isMySlot
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-200 bg-gray-50'

                    return (
                      <div key={key} className={`border rounded-lg p-2.5 space-y-1 ${statusColor}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                            {slot.role}{isMySlot ? ' — Your Slot' : ''}
                          </p>
                          {isSigned2
                            ? <span className="text-[10px] font-medium text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">✓ Approved</span>
                            : isMySlot && isActedOn && plan.status === 'for_revision'
                              ? <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">⟳ For Revision</span>
                              : isMySlot && isActedOn && plan.status === 'rejected'
                                ? <span className="text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">✕ Rejected</span>
                                : null
                          }
                        </div>
                        <p className="text-xs text-gray-700 font-medium">{slot.name || <span className="text-gray-400 italic">—</span>}</p>
                        {isSigned2 && (
                          <div className="flex justify-center my-1">
                            <img src={slot.signatureImage} alt="Signature" className="max-h-16 w-full object-contain" />
                          </div>
                        )}
                        {slot.approvedAt && (
                          <p className="text-[10px] text-green-600 text-center">{slot.approvedAt.slice(0, 10)}</p>
                        )}
                        {slot.remarks && (
                          <p className="text-xs text-gray-500 italic border-t border-gray-200 pt-1 mt-1">{slot.remarks}</p>
                        )}
                        {slot.sentForRevision && (
                          <p className="text-xs text-amber-600 font-medium">⟳ {slot.revisionReason}</p>
                        )}
                        {!prevSigned && !isMySlot && (
                          <p className="text-[10px] text-gray-400 italic">Waiting for previous approval</p>
                        )}
                      </div>
                    )
                  }

                  // ── Active editable slot ─────────────────────────────────────
                  // Show "waiting" state if previous approver hasn't signed yet
                  if (!prevSigned) {
                    return (
                      <div key={key} className="border border-blue-200 rounded-lg p-3 bg-blue-50 opacity-70">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">{slot.role} — Your Slot</p>
                        <p className="text-xs text-gray-400 italic">Waiting for the previous approver to sign before you can act.</p>
                      </div>
                    )
                  }

                  return (
                    <div key={key} className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2.5">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">{slot.role} — Your Slot</p>

                      {/* Name */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Name</label>
                        <input
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                          placeholder="Your name"
                          value={slot.name}
                          onChange={e => updateSlot(key, { name: e.target.value })}
                        />
                      </div>

                      {/* Remarks */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Remarks / Comments</label>
                        <textarea
                          rows={2}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white resize-none"
                          placeholder="Add your remarks or comments..."
                          value={slot.remarks}
                          onChange={e => updateSlot(key, { remarks: e.target.value })}
                        />
                      </div>

                      {/* Signature */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Signature Photo</label>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureFile(f) }} />
                        {slot.signatureImage ? (
                          <div className="relative border border-green-300 rounded-lg p-2 bg-white flex flex-col items-center">
                            <img src={slot.signatureImage} alt="Signature" className="max-h-20 w-full object-contain" />
                            <button onClick={() => updateSlot(key, { signatureImage: undefined, approvedAt: undefined })}
                              className="absolute top-1 right-1 text-gray-300 hover:text-red-400 text-xs">✕</button>
                          </div>
                        ) : (
                          <div
                            onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
                            onDragLeave={() => setDraggingOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${draggingOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'}`}
                          >
                            <p className="text-[11px] text-gray-400">Drop signature image here</p>
                            <p className="text-[10px] text-gray-300 mt-0.5">or click to browse</p>
                          </div>
                        )}
                      </div>

                      {/* Save approval */}
                      <button onClick={handleSaveApproval} disabled={saving}
                        className={`w-full text-xs font-medium py-2 rounded-lg transition-colors ${saved ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
                        {saving ? 'Saving...' : saved ? '✓ Approval Saved' : 'Save Approval'}
                      </button>

                      {/* For Revision + Reject */}
                      {canAction && (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setShowRevisionModal(true)}
                            className="text-xs font-medium py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors">
                            For Revision
                          </button>
                          <button onClick={() => setShowRejectModal(true)}
                            className="text-xs font-medium py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Version History */}
                {plan.versionHistory.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-2.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Version History</p>
                    <div className="space-y-1.5">
                      {plan.versionHistory.map((v, i) => (
                        <div key={i} className="text-[10px] text-gray-500">
                          <span className="font-semibold text-gray-700">v{v.version}</span> — {v.date}
                          {v.reason !== 'N/A' && <span className="text-gray-400"> · {v.reason}</span>}
                          {v.by && <span className="text-gray-400"> · {v.by}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Plan details sidebar */}
            <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
              <div className="border-b border-gray-200 px-3 py-2 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-600">Plan Details</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <PlanHeader plan={plan} onChange={() => {}} readOnly />
              </div>
            </aside>

            {/* Activity table — partial edit for PIC when all approved */}
            <main className="flex-1 flex flex-col overflow-hidden p-3">
              <ActivityTable
                plan={plan}
                onChange={picPartialEdit ? (next) => setPlan(next) : () => {}}
                readOnly={!picPartialEdit}
                partialEdit={picPartialEdit}
              />
            </main>
          </>
        )}

        {tab === 'selfcheck' && (
          <main className="flex-1 overflow-auto p-4">
            <SelfCheckTRView data={selfCheck} onChange={() => {}} />
          </main>
        )}
      </div>
    </div>
  )
}
