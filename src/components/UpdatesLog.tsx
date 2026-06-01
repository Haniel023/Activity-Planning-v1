import { useState, useEffect, useRef } from 'react'
import type { ProgressUpdate } from '../types'
import { api } from '../api'

interface Props {
  planId: string
  canPost: boolean   // true only when fully approved
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-CA')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UpdatesLog({ planId, canPost }: Props) {
  const [updates, setUpdates]   = useState<ProgressUpdate[]>([])
  const [loading, setLoading]   = useState(true)
  const [author, setAuthor]     = useState(() => localStorage.getItem('ap_author') ?? '')
  const [message, setMessage]   = useState('')
  const [posting, setPosting]   = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<ProgressUpdate | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    api.listUpdates(planId)
      .then(setUpdates)
      .finally(() => setLoading(false))
  }, [planId])

  // Scroll to bottom when new update is added
  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [updates.length, loading])

  async function handlePost() {
    if (!message.trim()) return
    if (!author.trim()) { setPostError('Please enter your name.'); return }
    setPosting(true)
    setPostError(null)
    try {
      const { id, createdAt } = await api.postUpdate(planId, author.trim(), message.trim())
      const newUpdate: ProgressUpdate = { id, planId, author: author.trim(), message: message.trim(), createdAt }
      setUpdates(prev => [...prev, newUpdate])
      setMessage('')
      localStorage.setItem('ap_author', author.trim())
    } catch (e) {
      setPostError((e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(u: ProgressUpdate) {
    setConfirmDel(null)
    setDeleting(u.id)
    try {
      await api.deleteUpdate(planId, u.id)
      setUpdates(prev => prev.filter(x => x.id !== u.id))
    } catch { /* silently ignore */ }
    finally { setDeleting(null) }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">

      {/* Header */}
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Progress Updates</h2>
          {!loading && updates.length > 0 && (
            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full leading-none">
              {updates.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {canPost
            ? 'Post remarks or progress notes for this plan.'
            : 'This plan must be fully approved before updates can be posted.'}
        </p>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Loading updates...
          </div>
        )}

        {!loading && updates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 font-medium">No updates yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {canPost ? 'Be the first to post a progress update.' : 'Updates will appear here once the plan is fully approved.'}
            </p>
          </div>
        )}

        {!loading && updates.map((u, i) => {
          const isFirst = i === 0 || updates[i - 1].author !== u.author
          return (
            <div key={u.id} className={`group flex gap-3 ${isFirst ? 'mt-2' : 'mt-1'}`}>
              {/* Avatar */}
              <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold select-none">
                {u.author.charAt(0).toUpperCase()}
              </div>

              {/* Bubble */}
              <div className="flex-1 min-w-0">
                {isFirst && (
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-700">{u.author}</span>
                    <span className="text-[10px] text-gray-400" title={formatDateTime(u.createdAt)}>
                      {timeAgo(u.createdAt)}
                    </span>
                  </div>
                )}
                <div className="relative bg-white border border-gray-200 rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm group-hover:border-gray-300 transition-colors">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{u.message}</p>
                  {!isFirst && (
                    <span className="text-[10px] text-gray-400 block mt-1" title={formatDateTime(u.createdAt)}>
                      {timeAgo(u.createdAt)}
                    </span>
                  )}
                  {/* Delete button — appears on hover */}
                  <button
                    onClick={() => setConfirmDel(u)}
                    disabled={deleting === u.id}
                    className="absolute top-1.5 right-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all disabled:opacity-30"
                    title="Delete update"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Delete confirmation inline */}
      {confirmDel && (
        <div className="shrink-0 bg-red-50 border border-red-200 rounded-xl p-3 mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">Delete this update? This cannot be undone.</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setConfirmDel(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
            <button
              onClick={() => handleDelete(confirmDel)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-1 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Post form */}
      {canPost ? (
        <div className="shrink-0 bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {author ? author.charAt(0).toUpperCase() : '?'}
            </div>
            <input
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Your name"
              value={author}
              onChange={e => setAuthor(e.target.value)}
            />
          </div>
          <textarea
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none placeholder:text-gray-400"
            placeholder="Write a progress update, remark, or note…"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePost()
            }}
          />
          {postError && <p className="text-xs text-red-500">{postError}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Ctrl + Enter to post</span>
            <button
              onClick={handlePost}
              disabled={posting || !message.trim()}
              className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {posting ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Posting…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> Post Update</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border border-dashed border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">Posting is available once all 4 approvals are signed.</p>
        </div>
      )}
    </div>
  )
}
