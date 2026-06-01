import type { ActivityPlan, ApprovalSection, SelfCheckTR, ActivityRequest, ProgressUpdate, GroupType } from './types'
import { calcPlanStatus } from './utils'

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'

export interface PlanSummary {
  id: string
  title: string
  type: string
  status: string
  version: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  approvalCount: number
  projectStatus: string
  projectProgress: number
  picName: string
  groupType: GroupType | null
}

async function req(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.json()
}

export const api = {
  async listPlans(): Promise<PlanSummary[]> {
    const rows = await req(`${BASE}/plans`)
    return rows.map((row: any) => {
      const fakePlan = { activities: row.activities || [], months: row.months || [], targetDate: row.targetDate } as ActivityPlan
      const ps = calcPlanStatus(fakePlan)
      return {
        id: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        publishedAt: row.publishedAt,
        approvalCount: row.approvalCount,
        picName: row.picName || '',
        groupType: row.groupType ?? null,
        projectStatus: ps.label,
        projectProgress: ps.progress,
      }
    })
  },

  async getPlan(id: string): Promise<{ plan: ActivityPlan; selfCheck: SelfCheckTR | null }> {
    return req(`${BASE}/plans/${id}`)
  },

  async createPlan(plan: ActivityPlan, selfCheck: SelfCheckTR): Promise<{ id: string }> {
    return req(`${BASE}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, selfCheck }),
    })
  },

  async updatePlan(id: string, plan: ActivityPlan, selfCheck: SelfCheckTR): Promise<void> {
    await req(`${BASE}/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, selfCheck }),
    })
  },

  async deletePlan(id: string): Promise<void> {
    await req(`${BASE}/plans/${id}`, { method: 'DELETE' })
  },

  async publishPlan(id: string): Promise<void> {
    await req(`${BASE}/plans/${id}/publish`, { method: 'POST' })
  },

  async sendForRevision(id: string, reason: string, by: string): Promise<{ newVersion: string }> {
    return req(`${BASE}/plans/${id}/revision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, by }),
    })
  },

  async republish(id: string, by: string): Promise<{ newVersion: string }> {
    return req(`${BASE}/plans/${id}/republish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by }),
    })
  },

  async rejectPlan(id: string, reason: string, by: string): Promise<void> {
    await req(`${BASE}/plans/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, by }),
    })
  },

  async versionUp(id: string, reason: string, by: string): Promise<{ newVersion: string }> {
    return req(`${BASE}/plans/${id}/version-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, by }),
    })
  },

  async saveProgress(id: string, activities: ActivityPlan['activities']): Promise<void> {
    await req(`${BASE}/plans/${id}/save-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities }),
    })
  },

  async updateApprovals(id: string, approvals: ApprovalSection): Promise<void> {
    await req(`${BASE}/plans/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvals }),
    })
  },

  // ── Activity Requests ────────────────────────────────────────────────────────

  async listRequests(): Promise<ActivityRequest[]> {
    return req(`${BASE}/requests`)
  },

  async createRequest(data: Omit<ActivityRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<{ id: string }> {
    return req(`${BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  async updateRequest(id: string, data: Partial<Omit<ActivityRequest, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await req(`${BASE}/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  async deleteRequest(id: string): Promise<void> {
    await req(`${BASE}/requests/${id}`, { method: 'DELETE' })
  },

  // ── Plan Updates ─────────────────────────────────────────────────────────────

  async listUpdates(planId: string): Promise<ProgressUpdate[]> {
    return req(`${BASE}/plans/${planId}/updates`)
  },

  async postUpdate(planId: string, author: string, message: string, activityId?: string, activityName?: string): Promise<{ id: string; createdAt: string }> {
    return req(`${BASE}/plans/${planId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, message, activityId: activityId || '', activityName: activityName || '' }),
    })
  },

  async deleteUpdate(planId: string, updateId: string): Promise<void> {
    await req(`${BASE}/plans/${planId}/updates/${updateId}`, { method: 'DELETE' })
  },
}
