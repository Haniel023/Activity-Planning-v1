import type { SelfCheckTR } from '../types'
import { CHECK_OPTIONS } from '../utils'

interface Props {
  data: SelfCheckTR
  onChange: (data: SelfCheckTR) => void
}

export default function SelfCheckTRView({ data, onChange }: Props) {
  function setItem(no: number, field: string, value: string) {
    onChange({
      ...data,
      items: data.items.map(item =>
        item.no === no ? { ...item, [field]: value } : item
      ),
    })
  }

  function addVersion() {
    onChange({
      ...data,
      versionHistory: [
        ...data.versionHistory,
        { version: '', reason: '', date: new Date().toISOString().slice(0, 10), updatedBy: '' },
      ],
    })
  }

  function setVersion(idx: number, field: string, value: string) {
    onChange({
      ...data,
      versionHistory: data.versionHistory.map((v, i) => i === idx ? { ...v, [field]: value } : v),
    })
  }

  function removeVersion(idx: number) {
    if (data.versionHistory.length <= 1) return
    onChange({ ...data, versionHistory: data.versionHistory.filter((_, i) => i !== idx) })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4">
        <h2 className="text-base font-semibold text-gray-700 flex-1">Self Check / Technical Review (TR)</h2>
        <div className="flex items-center gap-3 text-xs">
          <label className="text-gray-500">Self Check PIC:</label>
          <input
            className="border border-gray-200 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={data.selfCheckPIC}
            onChange={e => onChange({ ...data, selfCheckPIC: e.target.value })}
            placeholder="RA Incharge"
          />
          <label className="text-gray-500">TR PIC:</label>
          <input
            className="border border-gray-200 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={data.trPIC}
            onChange={e => onChange({ ...data, trPIC: e.target.value })}
            placeholder="Project Leader / SE"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="border border-gray-200 px-2 py-2 w-8">No.</th>
              <th className="border border-gray-200 px-2 py-2 text-left w-36">Checkpoint</th>
              <th className="border border-gray-200 px-2 py-2 text-left">Expected Result</th>
              <th className="border border-gray-200 px-2 py-2 text-center" colSpan={2}>
                Self Check<br />
                <span className="text-gray-400 font-normal">PIC: RA Incharge</span>
              </th>
              <th className="border border-gray-200 px-2 py-2 text-center" colSpan={2}>
                Technical Review<br />
                <span className="text-gray-400 font-normal">PIC: Project Leader / SE</span>
              </th>
              <th className="border border-gray-200 px-2 py-2 text-left w-48">Remarks</th>
            </tr>
            <tr className="bg-gray-50 text-gray-500">
              <th className="border border-gray-200" colSpan={3} />
              <th className="border border-gray-200 px-2 py-1 text-center w-20">1st Round</th>
              <th className="border border-gray-200 px-2 py-1 text-center w-20">2nd Round</th>
              <th className="border border-gray-200 px-2 py-1 text-center w-20">1st Round</th>
              <th className="border border-gray-200 px-2 py-1 text-center w-20">2nd Round</th>
              <th className="border border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => (
              <tr key={item.no} className="hover:bg-gray-50">
                <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-500">{item.no}</td>
                <td className="border border-gray-200 px-2 py-1.5 text-gray-700 font-medium">{item.checkpoint}</td>
                <td className="border border-gray-200 px-2 py-1.5 text-gray-600">{item.expectedResult}</td>
                {(['selfCheck1', 'selfCheck2', 'tr1', 'tr2'] as const).map(field => (
                  <td key={field} className="border border-gray-200 px-1 py-1 text-center">
                    <select
                      className="text-xs bg-transparent focus:outline-none w-full text-center"
                      value={item[field]}
                      onChange={e => setItem(item.no, field, e.target.value)}
                    >
                      {CHECK_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="border border-gray-200 px-2 py-1">
                  <input
                    className="w-full bg-transparent text-xs focus:outline-none text-gray-600"
                    value={item.remarks}
                    onChange={e => setItem(item.no, 'remarks', e.target.value)}
                    placeholder="—"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Version Control */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Version Control</h3>
          <button
            onClick={addVersion}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors"
          >
            + Add
          </button>
        </div>
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="border border-gray-200 px-2 py-1 text-left w-20">Version #</th>
              <th className="border border-gray-200 px-2 py-1 text-left">Reason for Revision</th>
              <th className="border border-gray-200 px-2 py-1 text-center w-28">Date</th>
              <th className="border border-gray-200 px-2 py-1 text-left w-32">Updated By</th>
              <th className="border border-gray-200 w-8" />
            </tr>
          </thead>
          <tbody>
            {data.versionHistory.map((v, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="border border-gray-200 px-1 py-0.5">
                  <input className="w-full bg-transparent focus:outline-none" value={v.version} onChange={e => setVersion(idx, 'version', e.target.value)} placeholder="1.00" />
                </td>
                <td className="border border-gray-200 px-1 py-0.5">
                  <input className="w-full bg-transparent focus:outline-none" value={v.reason} onChange={e => setVersion(idx, 'reason', e.target.value)} placeholder="Reason" />
                </td>
                <td className="border border-gray-200 px-1 py-0.5">
                  <input type="date" className="w-full bg-transparent focus:outline-none text-center" value={v.date} onChange={e => setVersion(idx, 'date', e.target.value)} />
                </td>
                <td className="border border-gray-200 px-1 py-0.5">
                  <input className="w-full bg-transparent focus:outline-none" value={v.updatedBy} onChange={e => setVersion(idx, 'updatedBy', e.target.value)} placeholder="Name" />
                </td>
                <td className="border border-gray-200 text-center">
                  <button onClick={() => removeVersion(idx)} className="text-red-300 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
