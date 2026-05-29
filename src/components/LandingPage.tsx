import type { PlanType } from '../types'

interface Props {
  onSelect: (type: PlanType) => void
}

export default function LandingPage({ onSelect }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Activity Planning Tool</h1>
          <p className="text-gray-500 text-lg">Create and export your activity plan for management approval</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => onSelect('development')}
            className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 text-left hover:shadow-xl hover:border-blue-400 transition-all group cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Development Plan</h2>
            <p className="text-gray-500 text-sm">For new development projects — includes Preparation, Design, Development, Testing, and Implementation phases.</p>
          </button>

          <button
            onClick={() => onSelect('support')}
            className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 text-left hover:shadow-xl hover:border-green-400 transition-all group cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Support Plan</h2>
            <p className="text-gray-500 text-sm">For support and investigation activities — includes Preparation, Investigation, Fixing, Documentation, and Cascading phases.</p>
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">No data is saved on any server — export only.</p>
      </div>
    </div>
  )
}
