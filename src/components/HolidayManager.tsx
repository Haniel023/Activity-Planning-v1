import { useState } from 'react'
import type { CompanyHoliday } from '../types'
import { PH_HOLIDAYS } from '../holidays'
import { api } from '../api'

interface Props {
  companyHolidays: CompanyHoliday[]
  visibleYear: number   // which year's PH holidays to preview
  onClose: () => void
  onChanged: (next: CompanyHoliday[]) => void
}

export default function HolidayManager({ companyHolidays, visibleYear, onClose, onChanged }: Props) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phThisYear = PH_HOLIDAYS.filter(h => h.date.startsWith(String(visibleYear)))

  async function handleAdd() {
    if (!date) { setError('Date is required.'); return }
    if (!name.trim()) { setError('Holiday name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const { id } = await api.createCompanyHoliday(date, name.trim())
      const newEntry: CompanyHoliday = { id, date, name: name.trim(), createdAt: new Date().toISOString() }
      onChanged([...companyHolidays, newEntry].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(h: CompanyHoliday) {
    try {
      await api.deleteCompanyHoliday(h.id)
      onChanged(companyHolidays.filter(x => x.id !== h.id))
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-800">Holiday Calendar</h2>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Add company holiday */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 mb-2">Add Company / Internal Holiday</h3>
            <div className="flex gap-2 items-end">
              <div className="flex-shrink-0">
                <label className="block text-[10px] text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 mb-1">Holiday Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="e.g. Company Foundation Day"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {saving ? 'Adding…' : '+ Add'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          {/* Company holidays list */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 mb-2">Company Holidays
              <span className="ml-1 text-[10px] font-normal text-gray-400">(shown in calendar with orange marker)</span>
            </h3>
            {companyHolidays.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No company holidays added yet.</p>
            ) : (
              <div className="space-y-1">
                {companyHolidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-orange-700">{h.date}</span>
                      <span className="text-xs text-gray-600">{h.name}</span>
                      <span className="text-[9px] text-orange-400 border border-orange-200 px-1.5 py-0.5 rounded-full">Company</span>
                    </div>
                    <button onClick={() => handleDelete(h)} className="text-gray-300 hover:text-red-400 transition-colors" title="Remove">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PH Holidays reference */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 mb-2">🇵🇭 Philippine Holidays {visibleYear}
              <span className="ml-1 text-[10px] font-normal text-gray-400">(built-in, read-only)</span>
            </h3>
            {phThisYear.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No PH holidays data for {visibleYear}.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {phThisYear.map(h => (
                  <div key={h.date} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
                    <span className="text-xs font-medium text-gray-500">{h.date}</span>
                    <span className="text-xs text-gray-600 truncate">{h.name}</span>
                    <span className={`text-[9px] shrink-0 border px-1.5 py-0.5 rounded-full ${h.type === 'regular' ? 'text-red-600 border-red-200 bg-red-50' : 'text-amber-600 border-amber-200 bg-amber-50'}`}>
                      {h.type === 'regular' ? 'Regular' : 'Special'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
