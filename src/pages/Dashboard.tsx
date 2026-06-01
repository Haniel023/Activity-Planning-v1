import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PlanSummary } from '../api'
import { createDefaultPlan, createDefaultSelfCheck } from '../utils'
import type { PlanType, ActivityRequest, GroupType } from '../types'
import ConfirmModal from '../components/ConfirmModal'

type DashView = 'plans' | 'analytics' | 'requests'

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
const PROJECT_CHIP: Record<string, string> = {
  COMPLETE:      'bg-green-100 text-green-700',
  'ON TIME':     'bg-blue-100 text-blue-700',
  'AT RISK':     'bg-amber-100 text-amber-700',
  DELAYED:       'bg-red-100 text-red-700',
  'NOT STARTED': 'bg-gray-100 text-gray-500',
}
const PROJECT_BAR: Record<string, string> = {
  COMPLETE:      'bg-green-500',
  'ON TIME':     'bg-blue-500',
  'AT RISK':     'bg-amber-500',
  DELAYED:       'bg-red-500',
  'NOT STARTED': 'bg-gray-400',
}
const GROUP_STYLE: Record<GroupType, { chip: string; bar: string; border: string }> = {
  SMART:   { chip: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500', border: 'border-purple-200' },
  DEV:     { chip: 'bg-blue-100 text-blue-700',     bar: 'bg-blue-500',   border: 'border-blue-200'   },
  NETWORK: { chip: 'bg-teal-100 text-teal-700',     bar: 'bg-teal-500',   border: 'border-teal-200'   },
}
const REQ_STATUS_CHIP: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done:        'bg-green-100 text-green-700',
}
const REQ_STATUS_LABEL: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  done:        'Done',
}

function ApprovalDots({ count }: { count: number }) {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full border ${i < count ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}
        />
      ))}
      <span className="text-xs text-gray-400 ml-1">{count}/4</span>
    </div>
  )
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

const ALL_GROUPS: GroupType[] = ['SMART', 'DEV', 'NETWORK']
const PROJECT_STATUSES = ['COMPLETE', 'ON TIME', 'AT RISK', 'DELAYED', 'NOT STARTED'] as const

function groupAnalytics(plans: PlanSummary[]) {
  const result = [...ALL_GROUPS, 'Unassigned' as const].map(group => {
    const subset = group === 'Unassigned'
      ? plans.filter(p => !p.groupType)
      : plans.filter(p => p.groupType === group)
    const avgProgress = subset.length > 0
      ? subset.reduce((s, p) => s + p.projectProgress, 0) / subset.length
      : 0
    const statusBreakdown = PROJECT_STATUSES.reduce((acc, s) => {
      acc[s] = subset.filter(p => p.projectStatus === s).length
      return acc
    }, {} as Record<string, number>)
    return { group, count: subset.length, avgProgress, statusBreakdown }
  })
  return result
}

// ── Empty form factories ──────────────────────────────────────────────────────

function emptyRequestForm() {
  return { title: '', description: '', targetDate: '', itNumber: '', pic: '', createdBy: '' }
}

export default function Dashboard() {
  const navigate = useNavigate()

  // ── Plans state ──────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'development' | 'support'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'for_revision' | 'rejected'>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  // ── View state ───────────────────────────────────────────────────────────────
  const [view, setView] = useState<DashView>('plans')

  // ── Requests state ───────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<ActivityRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestForm, setRequestForm] = useState(emptyRequestForm())
  const [editingRequest, setEditingRequest] = useState<ActivityRequest | null>(null)
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState<ActivityRequest | null>(null)
  const [filterReqStatus, setFilterReqStatus] = useState<'all' | 'open' | 'in_progress' | 'done'>('open')
  const [reqSearch, setReqSearch] = useState('')
  const [makePlanFor, setMakePlanFor] = useState<ActivityRequest | null>(null)
  const [savingRequest, setSavingRequest] = useState(false)

  useEffect(() => { document.title = 'Activity Planning' }, [])

  // ── Load plans ───────────────────────────────────────────────────────────────
  async function loadPlans() {
    setPlansLoading(true)
    setPlansError(null)
    try { setPlans(await api.listPlans()) }
    catch { setPlansError('Could not connect to server. Make sure the API server is running (npm run server).') }
    finally { setPlansLoading(false) }
  }

  useEffect(() => { loadPlans() }, [])

  // ── Load requests when tab is opened ────────────────────────────────────────
  async function loadRequests() {
    setRequestsLoading(true)
    try { setRequests(await api.listRequests()) }
    catch { /* silently fail, server might not have restarted yet */ }
    finally { setRequestsLoading(false) }
  }

  useEffect(() => {
    if (view === 'requests') loadRequests()
  }, [view])

  // ── Plans actions ────────────────────────────────────────────────────────────
  async function handleSelectType(
    type: PlanType,
    prefillTitle?: string,
    fromRequestId?: string,
    prefillTargetDate?: string,
    prefillPic?: string,
    prefillItNumber?: string,
  ) {
    if (creating) return
    setCreating(true)
    try {
      const plan = createDefaultPlan(type)
      if (prefillTitle) plan.title = prefillTitle
      if (prefillTargetDate) plan.targetDate = prefillTargetDate
      if (prefillItNumber) plan.itNumber = prefillItNumber
      if (prefillPic) {
        // Fill PIC into the relevant persons field
        if (type === 'development') {
          ;(plan.persons as any).developer = prefillPic
        } else {
          ;(plan.persons as any).smartMember = prefillPic
        }
        // Fill Prepared By (approval)
        plan.approvals.preparedBy.name = prefillPic
      }
      const selfCheck = createDefaultSelfCheck()
      if (prefillPic) selfCheck.selfCheckPIC = prefillPic
      const { id } = await api.createPlan(plan, selfCheck)
      if (fromRequestId) {
        await api.updateRequest(fromRequestId, { status: 'in_progress' })
        setRequests(prev => prev.map(r => r.id === fromRequestId ? { ...r, status: 'in_progress' } : r))
      }
      navigate(`/plan/${id}`)
    } catch {
      alert('Failed to create plan. Is the server running?')
      setCreating(false)
    }
  }

  async function doDelete(id: string) {
    setDeleting(id)
    setConfirmDelete(null)
    try {
      await api.deletePlan(id)
      setPlans(prev => prev.filter(p => p.id !== id))
    } catch { alert('Failed to delete plan.') }
    finally { setDeleting(null) }
  }

  function copyViewLink(id: string) {
    const url = `${window.location.origin}/view/${id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => alert('View link copied!'))
    } else {
      prompt('Copy this link:', url)
    }
  }

  const filteredPlans = plans.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType !== 'all' && p.type !== filterType) return false
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    return true
  })
  const totalPages = Math.ceil(filteredPlans.length / PAGE_SIZE)
  const pagedPlans = filteredPlans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  function setFilter<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setPage(1) } }

  // ── Request actions ──────────────────────────────────────────────────────────
  function openCreateRequest() {
    setEditingRequest(null)
    setRequestForm(emptyRequestForm())
    setShowRequestForm(true)
  }

  function openEditRequest(r: ActivityRequest) {
    setEditingRequest(r)
    setRequestForm({ title: r.title, description: r.description, targetDate: r.targetDate, itNumber: r.itNumber, pic: r.pic, createdBy: r.createdBy })
    setShowRequestForm(true)
  }

  async function saveRequest() {
    if (!requestForm.title.trim()) { alert('Please enter a title.'); return }
    setSavingRequest(true)
    try {
      if (editingRequest) {
        await api.updateRequest(editingRequest.id, requestForm)
        setRequests(prev => prev.map(r => r.id === editingRequest.id ? { ...r, ...requestForm, updatedAt: new Date().toISOString() } : r))
      } else {
        const { id } = await api.createRequest(requestForm)
        const newReq: ActivityRequest = {
          id,
          ...requestForm,
          status: 'open',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setRequests(prev => [newReq, ...prev])
      }
      setShowRequestForm(false)
    } catch (e) { alert('Failed to save request: ' + (e as Error).message) }
    finally { setSavingRequest(false) }
  }

  async function doDeleteRequest(id: string) {
    setConfirmDeleteRequest(null)
    try {
      await api.deleteRequest(id)
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch { alert('Failed to delete request.') }
  }

  async function markRequestDone(r: ActivityRequest) {
    try {
      await api.updateRequest(r.id, { status: 'done' })
      setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: 'done' } : x))
    } catch { alert('Failed to update status.') }
  }

  const filteredRequests = requests.filter(r => {
    if (filterReqStatus !== 'all' && r.status !== filterReqStatus) return false
    if (reqSearch && !r.title.toLowerCase().includes(reqSearch.toLowerCase()) && !r.pic.toLowerCase().includes(reqSearch.toLowerCase())) return false
    return true
  })

  // ── Analytics ────────────────────────────────────────────────────────────────
  const analytics = groupAnalytics(plans)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete Plan"
          message={`Delete "${confirmDelete.title || 'Untitled Plan'}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => doDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmDeleteRequest && (
        <ConfirmModal
          title="Delete Request"
          message={`Delete "${confirmDeleteRequest.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => doDeleteRequest(confirmDeleteRequest.id)}
          onCancel={() => setConfirmDeleteRequest(null)}
        />
      )}

      {/* New Plan from scratch */}
      {showNewModal && (
        <PlanTypeModal
          title="New Activity Plan"
          subtitle="Choose a plan type to get started"
          onSelect={type => { setShowNewModal(false); handleSelectType(type) }}
          onClose={() => setShowNewModal(false)}
          creating={creating}
        />
      )}

      {/* New Plan from request */}
      {makePlanFor && (
        <PlanTypeModal
          title={`Create Plan from Request`}
          subtitle={`"${makePlanFor.title}" — choose the plan type`}
          onSelect={type => { handleSelectType(type, makePlanFor.title, makePlanFor.id, makePlanFor.targetDate, makePlanFor.pic, makePlanFor.itNumber); setMakePlanFor(null) }}
          onClose={() => setMakePlanFor(null)}
          creating={creating}
        />
      )}

      {/* Request create/edit form */}
      {showRequestForm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRequestForm(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">{editingRequest ? 'Edit Request' : 'New Activity Request'}</h2>
              <button onClick={() => setShowRequestForm(false)} className="text-gray-300 hover:text-gray-500 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Activity Title *">
                <input className={INPUT} value={requestForm.title} onChange={e => setRequestForm(f => ({ ...f, title: e.target.value }))} placeholder="What activity is being requested?" />
              </Field>
              <Field label="Description">
                <textarea className={`${INPUT} resize-none`} rows={3} value={requestForm.description} onChange={e => setRequestForm(f => ({ ...f, description: e.target.value }))} placeholder="Details about the activity..." />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target Date">
                  <input type="date" className={INPUT} value={requestForm.targetDate} onChange={e => setRequestForm(f => ({ ...f, targetDate: e.target.value }))} />
                </Field>
                <Field label="IT Number">
                  <input className={INPUT} value={requestForm.itNumber} onChange={e => setRequestForm(f => ({ ...f, itNumber: e.target.value }))} placeholder="e.g. IT-2026-001" />
                </Field>
              </div>
              <Field label="PIC (Person in Charge)">
                <input className={INPUT} value={requestForm.pic} onChange={e => setRequestForm(f => ({ ...f, pic: e.target.value }))} placeholder="Assigned to" />
              </Field>
              <Field label="Requested by">
                <input className={INPUT} value={requestForm.createdBy} onChange={e => setRequestForm(f => ({ ...f, createdBy: e.target.value }))} placeholder="Your name" />
              </Field>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowRequestForm(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              <button
                onClick={saveRequest}
                disabled={savingRequest}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingRequest ? 'Saving...' : editingRequest ? 'Save Changes' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-xl font-bold text-gray-800">Activity Planning</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage and track all activity plans</p>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-sm relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={view === 'requests' ? 'Search requests...' : 'Search plans...'}
              value={view === 'requests' ? reqSearch : search}
              onChange={e => view === 'requests' ? setReqSearch(e.target.value) : (setSearch(e.target.value), setPage(1))}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
            />
            {(view === 'requests' ? reqSearch : search) && (
              <button
                onClick={() => view === 'requests' ? setReqSearch('') : (setSearch(''), setPage(1))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Action button */}
          {view === 'plans' && (
            <button
              onClick={() => setShowNewModal(true)}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Plan
            </button>
          )}
          {view === 'requests' && (
            <button
              onClick={openCreateRequest}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Request
            </button>
          )}
        </div>

        {/* View tabs + filters */}
        <div className="max-w-6xl mx-auto px-6 pb-3 flex items-center gap-3 flex-wrap">
          {/* View tabs */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs shrink-0">
            {(['plans', 'analytics', 'requests'] as DashView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition-colors capitalize ${view === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                {v === 'plans' ? 'Plans' : v === 'analytics' ? 'Analytics' : 'Requests'}
              </button>
            ))}
          </div>

          {/* Plans filters */}
          {view === 'plans' && (
            <>
              <span className="text-gray-200 text-sm">|</span>
              {(['all', 'development', 'support'] as const).map(t => (
                <button key={t} onClick={() => setFilter(setFilterType)(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {t === 'all' ? 'All Types' : t === 'development' ? 'Development' : 'Support'}
                </button>
              ))}
              <span className="text-gray-200 text-sm">|</span>
              {(['all', 'draft', 'published', 'for_revision', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setFilter(setFilterStatus)(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {s === 'all' ? 'All Status' : STATUS_LABEL[s]}
                </button>
              ))}
            </>
          )}

          {/* Requests filters */}
          {view === 'requests' && (
            <>
              <span className="text-gray-200 text-sm">|</span>
              {(['all', 'open', 'in_progress', 'done'] as const).map(s => (
                <button key={s} onClick={() => setFilterReqStatus(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterReqStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {s === 'all' ? 'All' : REQ_STATUS_LABEL[s]}
                </button>
              ))}
            </>
          )}
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-6">

        {/* ── PLANS VIEW ──────────────────────────────────────────────────── */}
        {view === 'plans' && (
          <>
            {plansLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
                <span className="text-gray-500 text-sm">Loading plans...</span>
              </div>
            )}
            {plansError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">Server not reachable</p>
                  <p className="text-red-600 mt-0.5">{plansError}</p>
                  <button onClick={loadPlans} className="mt-2 text-xs text-red-700 underline">Retry</button>
                </div>
              </div>
            )}
            {!plansLoading && !plansError && plans.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No plans yet</p>
                <p className="text-gray-400 text-sm mt-1">Create your first activity plan to get started</p>
                <button onClick={() => setShowNewModal(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  Create Plan
                </button>
              </div>
            )}
            {!plansLoading && !plansError && plans.length > 0 && filteredPlans.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm">No plans match your filters.</p>
                <button onClick={() => { setSearch(''); setFilterType('all'); setFilterStatus('all'); setPage(1) }} className="mt-2 text-xs text-blue-500 underline">Clear filters</button>
              </div>
            )}
            {!plansLoading && !plansError && filteredPlans.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">{filteredPlans.length} of {plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
                  <button onClick={loadPlans} title="Refresh" className="text-gray-300 hover:text-blue-500 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                {pagedPlans.map(plan => (
                  <div key={plan.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4 flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${plan.type === 'development' ? 'bg-blue-50' : 'bg-green-50'}`}>
                        {plan.type === 'development' ? (
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-800 truncate">
                            {plan.title || <span className="text-gray-400 italic font-normal">Untitled Plan</span>}
                          </h3>
                          <span className="text-xs text-gray-400">v{plan.version}</span>
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[plan.status] || 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABEL[plan.status] || plan.status}
                          </span>
                          {plan.groupType && (
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${GROUP_STYLE[plan.groupType].chip}`}>
                              {plan.groupType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${PROJECT_CHIP[plan.projectStatus] || 'bg-gray-100 text-gray-500'}`}>
                            {plan.projectStatus}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${PROJECT_BAR[plan.projectStatus] || 'bg-gray-400'}`} style={{ width: `${plan.projectProgress}%` }} />
                            </div>
                            <span className="text-xs text-gray-400">{plan.projectProgress.toFixed(0)}%</span>
                          </div>
                          <ApprovalDots count={plan.approvalCount} />
                          {plan.picName && (
                            <span className="text-xs text-gray-400">PIC: <span className="text-gray-600 font-medium">{plan.picName}</span></span>
                          )}
                          <span className="text-xs text-gray-400">Updated {plan.updatedAt.slice(0, 10)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {plan.status !== 'draft' && (
                          <button onClick={() => copyViewLink(plan.id)} title="Copy view link"
                            className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            Link
                          </button>
                        )}
                        <button onClick={() => navigate(`/plan/${plan.id}`)} className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors font-medium">
                          Open
                        </button>
                        <button onClick={() => setConfirmDelete({ id: plan.id, title: plan.title })} disabled={deleting === plan.id}
                          className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 pt-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">←</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                      <button key={n} onClick={() => setPage(n)}
                        className={`w-8 py-1.5 text-xs border rounded-lg transition-colors ${n === page ? 'bg-blue-600 border-blue-600 text-white font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        {n}
                      </button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">→</button>
                    <span className="text-xs text-gray-400 ml-1">Page {page} of {totalPages}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── ANALYTICS VIEW ──────────────────────────────────────────────── */}
        {view === 'analytics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-gray-700 mb-1">Group Performance Overview</h2>
              <p className="text-xs text-gray-400">Based on {plans.length} plan{plans.length !== 1 ? 's' : ''} — project status per group</p>
            </div>

            {plansLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {analytics.map(({ group, count, avgProgress, statusBreakdown }) => {
                  const gStyle = group !== 'Unassigned' ? GROUP_STYLE[group as GroupType] : null
                  return (
                    <div key={group} className={`bg-white border rounded-xl p-4 shadow-sm ${gStyle ? gStyle.border : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gStyle ? gStyle.chip : 'bg-gray-100 text-gray-600'}`}>
                          {group}
                        </span>
                        <span className="text-lg font-bold text-gray-800">{count}</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">Avg. Progress</p>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className={`h-full rounded-full transition-all ${gStyle ? gStyle.bar : 'bg-gray-400'}`} style={{ width: `${avgProgress}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mb-3">{avgProgress.toFixed(1)}%</p>
                      <div className="space-y-1">
                        {PROJECT_STATUSES.map(s => statusBreakdown[s] > 0 && (
                          <div key={s} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${PROJECT_BAR[s] || 'bg-gray-400'}`} />
                              <span className="text-[11px] text-gray-500">{s}</span>
                            </div>
                            <span className="text-[11px] font-medium text-gray-700">{statusBreakdown[s]}</span>
                          </div>
                        ))}
                        {count === 0 && <p className="text-[11px] text-gray-400 italic">No plans assigned</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Summary table */}
            {!plansLoading && plans.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Plans by Group</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-left">
                        <th className="px-4 py-2 font-medium">Plan</th>
                        <th className="px-4 py-2 font-medium">Group</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Progress</th>
                        <th className="px-4 py-2 font-medium">Project Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map(p => (
                        <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/plan/${p.id}`)}>
                          <td className="px-4 py-2 font-medium text-gray-800 truncate max-w-48">{p.title || <span className="text-gray-400 italic">Untitled</span>}</td>
                          <td className="px-4 py-2">
                            {p.groupType ? (
                              <span className={`px-1.5 py-0.5 rounded-full font-medium ${GROUP_STYLE[p.groupType].chip}`}>{p.groupType}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_CHIP[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${PROJECT_BAR[p.projectStatus] || 'bg-gray-400'}`} style={{ width: `${p.projectProgress}%` }} />
                              </div>
                              <span>{p.projectProgress.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${PROJECT_CHIP[p.projectStatus] || 'bg-gray-100 text-gray-500'}`}>{p.projectStatus}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REQUESTS VIEW ───────────────────────────────────────────────── */}
        {view === 'requests' && (
          <div className="space-y-4">
            {requestsLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-gray-500 text-sm">Loading requests...</span>
              </div>
            )}

            {!requestsLoading && filteredRequests.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No activity requests yet</p>
                <p className="text-gray-400 text-sm mt-1">Members can post requests here — the assigned PIC can then create a plan from it</p>
                <button onClick={openCreateRequest} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  Post a Request
                </button>
              </div>
            )}

            {!requestsLoading && filteredRequests.length > 0 && (
              <>
                <p className="text-xs text-gray-400">{filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRequests.map(r => (
                    <div key={r.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
                      <div className="p-4 flex-1">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-gray-800 leading-snug">{r.title}</h3>
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${REQ_STATUS_CHIP[r.status]}`}>
                            {REQ_STATUS_LABEL[r.status]}
                          </span>
                        </div>
                        {r.description && (
                          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">{r.description}</p>
                        )}
                        <div className="space-y-1 text-xs text-gray-400">
                          {r.itNumber && (
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                              <span className="text-gray-600 font-medium">{r.itNumber}</span>
                            </div>
                          )}
                          {r.pic && (
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              PIC: <span className="text-gray-600 font-medium">{r.pic}</span>
                            </div>
                          )}
                          {r.targetDate && (
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              Target: <span className="text-gray-600">{r.targetDate}</span>
                            </div>
                          )}
                          {r.createdBy && (
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              By: <span className="text-gray-600">{r.createdBy}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card actions */}
                      <div className="px-4 pb-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                        {r.status !== 'done' && (
                          <button
                            onClick={() => setMakePlanFor(r)}
                            className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors text-center"
                          >
                            Make Plan
                          </button>
                        )}
                        {r.status === 'in_progress' && (
                          <button
                            onClick={() => markRequestDone(r)}
                            className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Mark Done
                          </button>
                        )}
                        <button onClick={() => openEditRequest(r)} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setConfirmDeleteRequest(r)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function PlanTypeModal({ title, subtitle, onSelect, onClose, creating }: {
  title: string; subtitle: string
  onSelect: (t: PlanType) => void
  onClose: () => void
  creating: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => onSelect('development')} disabled={creating}
            className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md hover:border-blue-400 transition-all group disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Development Plan</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Preparation · Design · Development · Testing · Implementation</p>
          </button>
          <button onClick={() => onSelect('support')} disabled={creating}
            className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md hover:border-green-400 transition-all group disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Support Plan</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Preparation · Investigation · Fixing · Documentation · Cascading</p>
          </button>
        </div>
        {creating && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Creating plan...
          </div>
        )}
      </div>
    </div>
  )
}
