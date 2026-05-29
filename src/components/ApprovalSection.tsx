import type { ActivityPlan, Approver } from '../types'

interface Props {
  plan: ActivityPlan
  onChange: (plan: ActivityPlan) => void
}

export default function ApprovalSection({ plan, onChange }: Props) {
  const { approvals } = plan

  function setApprover(key: keyof typeof approvals, field: keyof Approver, value: string) {
    onChange({
      ...plan,
      approvals: { ...approvals, [key]: { ...(approvals[key] as Approver), [field]: value } },
    })
  }

  function setRemarks(value: string) {
    onChange({ ...plan, approvals: { ...approvals, remarks: value } })
  }

  const slots = [
    { key: 'preparedBy' as const, label: 'PREPARED BY' },
    { key: 'reviewedBy' as const, label: 'REVIEWED BY' },
    { key: 'approvedBy1' as const, label: 'APPROVED BY' },
    { key: 'approvedBy2' as const, label: 'APPROVED BY' },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {slots.map(({ key, label }) => {
          const approver = approvals[key] as Approver
          return (
            <div key={key} className="border border-gray-200 rounded-lg p-2 space-y-1.5 bg-gray-50">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
              <input
                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="Name"
                value={approver.name}
                onChange={e => setApprover(key, 'name', e.target.value)}
              />
              <input
                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="Role"
                value={approver.role}
                onChange={e => setApprover(key, 'role', e.target.value)}
              />
              <div className="h-8 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-300 bg-white">
                signature
              </div>
            </div>
          )
        })}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Remarks / Comments</label>
        <textarea
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
          value={approvals.remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Enter remarks or comments..."
        />
      </div>
    </div>
  )
}
