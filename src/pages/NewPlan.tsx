import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PlanType } from '../types'
import { createDefaultPlan, createDefaultSelfCheck } from '../utils'
import { api } from '../api'
import LandingPage from '../components/LandingPage'

export default function NewPlan() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  async function handleSelect(type: PlanType) {
    if (creating) return
    setCreating(true)
    try {
      const plan = createDefaultPlan(type)
      const selfCheck = createDefaultSelfCheck()
      const { id } = await api.createPlan(plan, selfCheck)
      navigate(`/plan/${id}`)
    } catch (err) {
      alert('Failed to create plan: ' + (err as Error).message)
      setCreating(false)
    }
  }

  return <LandingPage onSelect={handleSelect} loading={creating} />
}
