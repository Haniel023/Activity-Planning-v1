import { useRef } from 'react'
import type { ActivityPlan, ApproverSlot } from '../types'

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
  readOnly?: boolean
}

export default function ApprovalSection({ plan, onChange, readOnly }: Props) {
  const { approvals } = plan
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function setSlot(key: keyof typeof approvals, changes: Partial<ApproverSlot>) {
    onChange({
      ...plan,
      approvals: {
        ...approvals,
        [key]: { ...approvals[key], ...changes },
      },
    })
  }

  function handleSignatureFile(key: keyof typeof approvals, file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setSlot(key, { signatureImage: dataUrl, approvedAt: new Date().toISOString() })
    }
    reader.readAsDataURL(file)
  }

  const slots = [
    { key: 'preparedBy'  as const, label: 'PREPARED BY' },
    { key: 'reviewedBy'  as const, label: 'REVIEWED BY' },
    { key: 'approvedBy1' as const, label: 'APPROVED BY' },
    { key: 'approvedBy2' as const, label: 'APPROVED BY' },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {slots.map(({ key, label }) => {
          const slot = approvals[key]
          const isSigned = !!slot.signatureImage

          return (
            <div
              key={key}
              className={`border rounded-lg p-2 space-y-1.5 ${isSigned ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
                {isSigned && <span className="text-[9px] text-green-600 font-semibold">✓ Signed</span>}
              </div>

              <input
                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Name"
                value={slot.name}
                disabled={readOnly}
                onChange={e => setSlot(key, { name: e.target.value })}
              />
              {/* Role — always locked/display-only */}
              <div className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-400 bg-gray-100 select-none">
                {slot.role}
              </div>

              {/* Signature — upload only for PIC (preparedBy); others show placeholder */}
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

              {/* Approval date */}
              {slot.approvedAt && (
                <p className="text-[10px] text-green-600 text-center">
                  {slot.approvedAt!.slice(0, 10)}
                </p>
              )}

              {/* Per-slot remarks */}
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
    </div>
  )
}
