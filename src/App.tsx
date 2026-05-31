import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import PlanEditor from './pages/PlanEditor'
import PlanViewer from './pages/PlanViewer'
import NewPlan from './pages/NewPlan'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/plan/new" element={<NewPlan />} />
      <Route path="/plan/:id" element={<PlanEditor />} />
      <Route path="/view/:id" element={<PlanViewer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
