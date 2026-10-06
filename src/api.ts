import type { ActivityPlan, ApprovalSection, ActivityRequest, ProgressUpdate, GroupType, CompanyHoliday, ApproverEntry } from './types'
import { calcPlanStatus, migratePersonsToList, migrateToStakeholders } from './utils'

// VITE_API_BASE (if set at build time) pins the API to one fixed address.
// This server is reachable at both its LAN IP and a NAT'd address on the same ports,
// so by default we derive the API origin from whatever host the browser actually used
// to load the page — the same build then works correctly from either address.
const BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE + '/api'
  : import.meta.env.DEV
    ? '/api'
    : `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_API_PORT ?? '1101'}/api`

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
  projectReason: string
  picName: string
  itNumber: string
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
      const fakePlan = { activities: row.activities || [], months: row.months || [], startDate: row.startDate, targetDate: row.targetDate } as ActivityPlan
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
        itNumber: row.itNumber || '',
        groupType: row.groupType ?? null,
        projectStatus: ps.label,
        projectProgress: ps.progress,
        projectReason: ps.reason,
      }
    })
  },

  async getPlan(id: string): Promise<{ plan: ActivityPlan }> {
    const result = await req(`${BASE}/plans/${id}`)
    const plan = result.plan as ActivityPlan
    if (!plan.personsList || plan.personsList.length === 0) {
      plan.personsList = migratePersonsToList(plan.type, plan.persons as any)
    }
    if (!plan.stakeholders || plan.stakeholders.length === 0) {
      plan.stakeholders = migrateToStakeholders(plan.personsList, plan.persons as any, plan.type)
    }
    return { plan }
  },

  // Fetches decrypted signature images — only ever called right before exporting,
  // never on normal plan load. Normal loads only carry a "signed" placeholder.
  async getExportApprovals(id: string): Promise<ApprovalSection> {
    const result = await req(`${BASE}/plans/${id}/signatures`)
    return result.approvals
  },

  async createPlan(plan: ActivityPlan): Promise<{ id: string }> {
    return req(`${BASE}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
  },

  async updatePlan(id: string, plan: ActivityPlan): Promise<void> {
    await req(`${BASE}/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
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

  async clearSignatures(id: string): Promise<void> {
    await req(`${BASE}/plans/${id}/clear-signatures`, { method: 'POST' })
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

  async listVersionSnapshots(id: string): Promise<{ version: string; event: string; createdAt: string }[]> {
    return req(`${BASE}/plans/${id}/versions`)
  },

  async getVersionSnapshot(id: string, version: string): Promise<{ data: ActivityPlan }> {
    return req(`${BASE}/plans/${id}/versions/${encodeURIComponent(version)}`)
  },

  async cancelPlan(id: string, by: string): Promise<void> {
    await req(`${BASE}/plans/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by }),
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

  // ── Company Holidays ─────────────────────────────────────────────────────────

  async listCompanyHolidays(): Promise<CompanyHoliday[]> {
    return req(`${BASE}/holidays`)
  },

  async createCompanyHoliday(date: string, name: string): Promise<{ id: string }> {
    return req(`${BASE}/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name }),
    })
  },

  async deleteCompanyHoliday(id: string): Promise<void> {
    await req(`${BASE}/holidays/${id}`, { method: 'DELETE' })
  },

  // ── Approvers ────────────────────────────────────────────────────────────────

  async listApprovers(): Promise<ApproverEntry[]> {
    return req(`${BASE}/approvers`)
  },

  async createApprover(name: string, email: string, position: string): Promise<{ id: string }> {
    return req(`${BASE}/approvers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, position }),
    })
  },

  async updateApprover(id: string, name: string, email: string, position: string): Promise<void> {
    await req(`${BASE}/approvers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, position }),
    })
  },

  async deleteApprover(id: string): Promise<void> {
    await req(`${BASE}/approvers/${id}`, { method: 'DELETE' })
  },
}
