import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PlanSummary } from '../api'
import { createDefaultPlan, createDefaultSelfCheck } from '../utils'
import type { PlanType } from '../types'
import ConfirmModal from '../components/ConfirmModal'

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
  COMPLETE:    'bg-green-100 text-green-700',
  'ON TIME':   'bg-blue-100 text-blue-700',
  'AT RISK':   'bg-amber-100 text-amber-700',
  DELAYED:     'bg-red-100 text-red-700',
  'NOT STARTED': 'bg-gray-100 text-gray-500',
}

function ApprovalDots({ count }: { count: number }) {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full border ${i < count ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}
          title={i < count ? 'Signed' : 'Pending'}
        />
      ))}
      <span className="text-xs text-gray-400 ml-1">{count}/4</span>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'development' | 'support'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'for_revision' | 'rejected'>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  useEffect(() => { document.title = 'Activity Planning' }, [])

  async function handleSelectType(type: PlanType) {
    if (creating) return
    setCreating(true)
    try {
      const plan = createDefaultPlan(type)
      const selfCheck = createDefaultSelfCheck()
      const { id } = await api.createPlan(plan, selfCheck)
      navigate(`/plan/${id}`)
    } catch {
      alert('Failed to create plan. Is the server running?')
      setCreating(false)
    }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setPlans(await api.listPlans())
    } catch (e) {
      setError('Could not connect to server. Make sure the API server is running (npm run server).')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredPlans = plans.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType !== 'all' && p.type !== filterType) return false
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    return true
  })
  const totalPages = Math.ceil(filteredPlans.length / PAGE_SIZE)
  const pagedPlans = filteredPlans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function setFilter<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  async function doDelete(id: string) {
    setDeleting(id)
    setConfirmDelete(null)
    try {
      await api.deletePlan(id)
      setPlans(prev => prev.filter(p => p.id !== id))
    } catch {
      alert('Failed to delete plan.')
    } finally {
      setDeleting(null)
    }
  }

  function copyViewLink(id: string) {
    const url = `${window.location.origin}/view/${id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => alert('View link copied to clipboard!'))
    } else {
      prompt('Copy this link to share with approvers:', url)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-xl font-bold text-gray-800">Activity Planning</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage and track all activity plans</p>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-sm relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search plans..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Plan
          </button>
        </div>

        {/* Filter chips */}
        <div className="max-w-6xl mx-auto px-6 pb-3 flex items-center gap-2 flex-wrap">
          {/* Type filters */}
          {(['all', 'development', 'support'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilter(setFilterType)(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              {t === 'all' ? 'All Types' : t === 'development' ? 'Development' : 'Support'}
            </button>
          ))}
          <span className="text-gray-200 text-sm">|</span>
          {/* Status filters */}
          {(['all', 'draft', 'published', 'for_revision', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(setFilterStatus)(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              {s === 'all' ? 'All Status' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
            <span className="text-gray-500 text-sm">Loading plans...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium">Server not reachable</p>
              <p className="text-red-600 mt-0.5">{error}</p>
              <button onClick={load} className="mt-2 text-xs text-red-700 underline">Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No plans yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first activity plan to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Create Plan
            </button>
          </div>
        )}

        {!loading && !error && plans.length > 0 && filteredPlans.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No plans match your search or filters.</p>
            <button onClick={() => { setSearch(''); setFilterType('all'); setFilterStatus('all'); setPage(1) }} className="mt-2 text-xs text-blue-500 underline">Clear filters</button>
          </div>
        )}

        {!loading && !error && filteredPlans.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400">{filteredPlans.length} of {plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
              <button onClick={load} title="Refresh" className="text-gray-300 hover:text-blue-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            {pagedPlans.map(plan => (
              <div
                key={plan.id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-4 flex items-start gap-4">
                  {/* Type icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${plan.type === 'development' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    {plan.type === 'development' ? (
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">
                        {plan.title || <span className="text-gray-400 italic font-normal">Untitled Plan</span>}
                      </h3>
                      <span className="text-xs text-gray-400">v{plan.version}</span>
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[plan.status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[plan.status] || plan.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {/* Project status */}
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${PROJECT_CHIP[plan.projectStatus] || 'bg-gray-100 text-gray-500'}`}>
                        {plan.projectStatus}
                      </span>
                      {/* Progress bar */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${plan.projectProgress}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{plan.projectProgress.toFixed(0)}%</span>
                      </div>
                      {/* Approval dots */}
                      <ApprovalDots count={plan.approvalCount} />
                      {/* PIC name */}
                      {plan.picName && (
                        <span className="text-xs text-gray-400">
                          PIC: <span className="text-gray-600 font-medium">{plan.picName}</span>
                        </span>
                      )}
                      {/* Updated */}
                      <span className="text-xs text-gray-400">
                        Updated {plan.updatedAt.slice(0, 10)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {plan.status !== 'draft' && (
                      <button
                        onClick={() => copyViewLink(plan.id)}
                        title="Copy view link for approvers"
                        className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Link
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/plan/${plan.id}`)}
                      className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors font-medium"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: plan.id, title: plan.title })}
                      disabled={deleting === plan.id}
                      title="Delete plan"
                      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 pt-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ←
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-8 py-1.5 text-xs border rounded-lg transition-colors ${n === page ? 'bg-blue-600 border-blue-600 text-white font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  →
                </button>
                <span className="text-xs text-gray-400 ml-1">Page {page} of {totalPages}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete Plan"
          message={`Delete "${confirmDelete.title || 'Untitled Plan'}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => doDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* New Plan modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800">New Activity Plan</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose a plan type to get started</p>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-gray-300 hover:text-gray-500 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleSelectType('development')}
                disabled={creating}
                className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md hover:border-blue-400 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Development Plan</h3>
                <p className="text-xs text-gray-400 leading-relaxed">Preparation · Design · Development · Testing · Implementation</p>
              </button>

              <button
                onClick={() => handleSelectType('support')}
                disabled={creating}
                className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md hover:border-green-400 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
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
      )}
    </div>
  )
}
