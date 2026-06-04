import { useState, useEffect } from 'react'
import type { ApproverEntry } from '../types'
import { api } from '../api'

function emptyForm() { return { name: '', email: '', position: '' } }

export default function ApproverMaintenance() {
  const [approvers, setApprovers] = useState<ApproverEntry[]>([])
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm())

  useEffect(() => { load() }, [])

  async function load() {
    try { setApprovers(await api.listApprovers()) } catch { /* ignore */ }
  }

  async function handleAdd() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const { id } = await api.createApprover(form.name.trim(), form.email.trim(), form.position.trim())
      const entry: ApproverEntry = { id, name: form.name.trim(), email: form.email.trim(), position: form.position.trim(), createdAt: new Date().toISOString() }
      setApprovers(prev => [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(emptyForm())
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  function startEdit(a: ApproverEntry) {
    setEditingId(a.id)
    setEditForm({ name: a.name, email: a.email, position: a.position })
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name.trim()) return
    try {
      await api.updateApprover(id, editForm.name.trim(), editForm.email.trim(), editForm.position.trim())
      setApprovers(prev =>
        prev.map(a => a.id === id ? { ...a, name: editForm.name.trim(), email: editForm.email.trim(), position: editForm.position.trim() } : a)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingId(null)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteApprover(id)
      setApprovers(prev => prev.filter(a => a.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">Approver List</h2>
        <p className="text-xs text-gray-400 mt-0.5">Pre-configure approvers for the approval dropdown in activity plans. Email is used for Teams @mentions via Power Automate.</p>
      </div>

      {/* Add form */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-600">Add Approver</h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Full Name <span className="text-red-400">*</span></label>
            <input
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="e.g. Juan dela Cruz"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">M365 Email</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="e.g. juan@company.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Position / Role</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              value={form.position}
              onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
            >
              <option value="">— Select role —</option>
              <option value="PROJECT LEADER">PROJECT LEADER</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="SECTION MANAGER">SECTION MANAGER</option>
              <option value="DEPARTMENT MANAGER">DEPARTMENT MANAGER</option>
              <option value="MANAGER">MANAGER (legacy)</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            disabled={saving}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Adding…' : '+ Add Approver'}
          </button>
        </div>
      </div>

      {/* Approver table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {approvers.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400">No approvers added yet.</p>
            <p className="text-xs text-gray-300 mt-1">Add one above to enable the dropdown in activity plan approvals.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Email</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Position</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {approvers.map(a => (
                editingId === a.id ? (
                  <tr key={a.id} className="bg-blue-50">
                    <td className="px-3 py-1.5">
                      <input autoFocus className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none" value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="email" className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none" value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none bg-white" value={editForm.position}
                        onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}>
                        <option value="">— Select role —</option>
                        <option value="PROJECT LEADER">PROJECT LEADER</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="MANAGER">MANAGER</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => handleSaveEdit(a.id)} className="text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{a.email || <span className="text-gray-300 italic">—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-500">{a.position || <span className="text-gray-300 italic">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => startEdit(a)} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                        <button onClick={() => handleDelete(a.id)} className="text-[10px] text-red-400 hover:text-red-600 font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Teams info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-3 items-start">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs text-blue-700 space-y-0.5">
          <p className="font-semibold">Power Automate Teams Integration</p>
          <p className="text-blue-500">When a plan is published, a notification is queued at <code className="bg-blue-100 px-1 rounded">GET /api/notifications/pending</code>. A Power Automate flow (via On-Premises Data Gateway) polls this endpoint and posts an Adaptive Card to your Teams channel — @mentioning the approvers using the emails stored here.</p>
        </div>
      </div>
    </div>
  )
}
