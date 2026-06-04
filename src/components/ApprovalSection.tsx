import { useRef, useEffect, useState } from 'react'
import type { ActivityPlan, ApproverSlot, ApproverEntry } from '../types'
import { api } from '../api'

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
  readOnly?: boolean
}

export default function ApprovalSection({ plan, onChange, readOnly }: Props) {
  const { approvals } = plan
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [approverList, setApproverList] = useState<ApproverEntry[]>([])

  useEffect(() => {
    api.listApprovers().then(setApproverList).catch(() => {})
  }, [])

  function setSlot(key: keyof typeof approvals, changes: Partial<ApproverSlot>) {
    onChange({
      ...plan,
      approvals: {
        ...approvals,
        [key]: { ...approvals[key], ...changes },
      },
    })
  }

  function toggleDeptManager(enabled: boolean) {
    onChange({
      ...plan,
      requiresDeptManager: enabled,
      approvals: {
        ...approvals,
        approvedBy3: enabled
          ? (approvals.approvedBy3 ?? { name: '', role: 'DEPARTMENT MANAGER', remarks: '' })
          : undefined,
      },
    })
  }

  function handleApproverSelect(key: keyof typeof approvals, id: string) {
    if (!id) {
      setSlot(key, { name: '', email: '' })
      return
    }
    const entry = approverList.find(a => a.id === id)
    if (entry) setSlot(key, { name: entry.name, email: entry.email })
  }

  function handleSignatureFile(key: keyof typeof approvals, file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setSlot(key, { signatureImage: dataUrl, approvedAt: new Date().toISOString() })
    }
    reader.readAsDataURL(file)
  }

  const baseSlots = [
    { key: 'preparedBy'  as const, label: 'PREPARED BY' },
    { key: 'reviewedBy'  as const, label: 'REVIEWED BY (PROJECT LEADER)' },
    { key: 'approvedBy1' as const, label: 'APPROVED BY (SUPERVISOR)' },
    { key: 'approvedBy2' as const, label: 'APPROVED BY (SECTION MANAGER)' },
  ]
  const deptSlot = { key: 'approvedBy3' as const, label: 'APPROVED BY (DEPARTMENT MANAGER)' }
  const slots = plan.requiresDeptManager ? [...baseSlots, deptSlot] : baseSlots

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {slots.map(({ key, label }) => {
          const slot = approvals[key]
          if (!slot) return null
          const isSigned = !!slot.signatureImage
          const isPIC = slot.role === 'PIC'
          const effectiveRole = slot.role === 'MANAGER' ? 'SECTION MANAGER' : slot.role
          const filteredApprovers = approverList.filter(a => a.position === effectiveRole || a.position === slot.role)
          const selectedId = filteredApprovers.find(a => a.name === slot.name)?.id ?? ''
          const useDropdown = !isPIC && !readOnly && filteredApprovers.length > 0

          return (
            <div
              key={key}
              className={`border rounded-lg p-2 space-y-1.5 ${key === 'approvedBy3' ? 'col-span-2' : ''} ${isSigned ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
                {isSigned && <span className="text-[9px] text-green-600 font-semibold">✓ Signed</span>}
              </div>

              {useDropdown ? (
                <select
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                  value={selectedId}
                  onChange={e => handleApproverSelect(key, e.target.value)}
                >
                  <option value="">— Select approver —</option>
                  {filteredApprovers.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder="Name"
                  value={slot.name}
                  disabled={readOnly}
                  onChange={e => setSlot(key, { name: e.target.value })}
                />
              )}

              {isPIC && !readOnly && (
                <input
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-blue-500 placeholder-gray-300"
                  placeholder="Email (for approval notification)"
                  type="email"
                  value={slot.email ?? ''}
                  onChange={e => setSlot(key, { email: e.target.value })}
                />
              )}
              {!isPIC && slot.email && (
                <p className="text-[9px] text-blue-400 truncate px-0.5" title={slot.email}>
                  {slot.email}
                </p>
              )}

              <div className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-400 bg-gray-100 select-none">
                {slot.role === 'MANAGER' ? 'SECTION MANAGER' : slot.role}
              </div>

              <input
                ref={el => { fileInputRefs.current[key] = el }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureFile(key, f) }}
              />
              {isSigned ? (
                <div className="relative border border-green-200 rounded bg-white p-2 flex flex-col items-center">
                  <img src={slot.signatureImage} alt="Signature" className="max-h-16 w-full object-contain" />
                  {!readOnly && key === 'preparedBy' && (
                    <button
                      onClick={() => setSlot(key, { signatureImage: undefined, approvedAt: undefined })}
                      className="absolute top-0.5 right-0.5 text-gray-300 hover:text-red-400 text-[10px]"
                    >✕</button>
                  )}
                </div>
              ) : key === 'preparedBy' && !readOnly ? (
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[key]?.click()}
                  className="w-full h-8 border border-dashed border-blue-300 rounded flex items-center justify-center text-[10px] bg-white text-blue-400 hover:bg-blue-50 transition-colors"
                >
                  click to upload signature
                </button>
              ) : (
                <div className="h-8 border border-dashed border-gray-200 rounded flex items-center justify-center text-[10px] text-gray-300 bg-gray-50">
                  signature via view link
                </div>
              )}

              {slot.approvedAt && (
                <p className="text-[10px] text-green-600 text-center">
                  {slot.approvedAt!.slice(0, 10)}
                </p>
              )}

              <textarea
                rows={1}
                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none bg-white disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Remarks..."
                value={slot.remarks}
                disabled={readOnly}
                onChange={e => setSlot(key, { remarks: e.target.value })}
              />

              {slot.sentForRevision && (
                <p className="text-[10px] text-amber-600 font-medium">⟳ For revision: {slot.revisionReason}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Department Manager toggle */}
      {!readOnly && (
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
            checked={!!plan.requiresDeptManager}
            onChange={e => toggleDeptManager(e.target.checked)}
          />
          <span className="text-[11px] text-gray-500 group-hover:text-gray-700">Requires Department Manager approval</span>
        </label>
      )}
    </div>
  )
}
