export type PlanType = 'development' | 'support' | 'training' | 'implementation'
export type GroupType = 'SMART' | 'DEV' | 'NETWORK'

export const PERSON_ROLES = [
  'Project Manager', 'Project Supervisor', 'Project Leader',
  'Support Supervisor', 'System Expert', 'Support PIC',
  'Designer', 'Developer', 'Technical Reviewer',
  'DBA/Release Support PIC', 'Gatepass PIC',
  'Requestor', 'Customer',
] as const

// Stakeholder roles offered for training-type plans (distinct from dev/support roles)
export const TRAINING_PERSON_ROLES = [
  'Trainer', 'Co-Trainer', 'Training Coordinator', 'Reviewer',
  'Venue PIC', 'Requestor', 'Project Manager', 'Customer',
] as const

export type PersonRole = typeof PERSON_ROLES[number]

export interface PersonEntry {
  id: string
  role: string
  name: string
}

export interface Stakeholder {
  id: string
  name: string
  roles: string[]   // one person can hold multiple roles
}

export interface CompanyHoliday {
  id: string
  date: string
  name: string
  createdAt: string
}

export type StatusValue =
  | 'NOT YET STARTED'
  | 'ONGOING'
  | 'DONE'
  | 'ON HOLD'

// Plan lifecycle status
export type PlanDocStatus = 'draft' | 'ongoing_approval' | 'published' | 'for_revision' | 'cancelled' | 'rejected'

export interface RACI {
  r: boolean
  a: boolean
  c: boolean
  i: boolean
}

export interface PICEntry {
  id: string
  pic: string
  raci: RACI
}

export interface DayMark {
  date: string   // "YYYY-MM-DD"
  plan: boolean
  actual: boolean
}

export interface ActivityRow {
  id: string
  number: string
  name: string
  isPhase: boolean
  picEntries: PICEntry[]
  status: StatusValue
  progress: number
  autoProgress?: boolean
  mh: number
  hoursPerDay?: number   // hours allocated per day for this activity (default 8)
  startDate?: string     // YYYY-MM-DD — auto-plotting starts from this date
  workingDays: number
  dayMarks: DayMark[]
}

export interface ApproverSlot {
  name: string
  role: string
  email?: string
  remarks: string
  signatureImage?: string
  approvedAt?: string
  sentForRevision?: boolean
  revisionReason?: string
}

export interface ApproverEntry {
  id: string
  name: string
  email: string
  position: string
  createdAt: string
}

export interface ApprovalSection {
  preparedBy: ApproverSlot
  reviewedBy: ApproverSlot
  approvedBy1: ApproverSlot
  approvedBy2: ApproverSlot
  approvedBy3?: ApproverSlot   // optional DEPARTMENT MANAGER (enabled via requiresDeptManager)
}

export interface DevPersons {
  requestor: string
  designer: string
  developer: string
  se: string
  pm: string
}

export interface SupportPersons {
  requestor: string
  smartMember: string
  se: string
  pm: string
}

export interface AdditionalPerson {
  id: string
  role: string
  name: string
}

export interface MonthConfig {
  year: number
  month: number  // 0-indexed
}

export interface VersionEntry {
  version: string
  date: string       // YYYY-MM-DD
  reason: string
  by: string
}

export interface ActivityPlan {
  id: string
  type: PlanType
  title: string
  itNumber?: string
  documentVersion: string
  groupType?: GroupType
  persons: DevPersons | SupportPersons
  personsList?: PersonEntry[]
  stakeholders?: Stakeholder[]
  additionalPersons?: AdditionalPerson[]
  approvals: ApprovalSection
  activities: ActivityRow[]
  months: MonthConfig[]
  otDays: string[]
  startDate?: string         // YYYY-MM-DD — overrides months[0] for status calculation
  targetDate?: string        // YYYY-MM-DD
  status: PlanDocStatus
  requiresDeptManager?: boolean   // enables optional approvedBy3 (DEPARTMENT MANAGER) slot
  versionHistory: VersionEntry[]
  publishedAt?: string
}

export interface ProgressUpdate {
  id: string
  planId: string
  author: string
  message: string
  activityId?: string
  activityName?: string
  createdAt: string
}

export interface ActivityRequest {
  id: string
  title: string
  description: string
  targetDate: string
  itNumber: string
  pic: string
  status: 'open' | 'in_progress' | 'done'
  createdBy: string
  createdAt: string
  updatedAt: string
}
