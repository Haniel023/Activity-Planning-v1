export type PlanType = 'development' | 'support'
export type GroupType = 'SMART' | 'DEV' | 'NETWORK'

export type StatusValue =
  | 'NOT YET STARTED'
  | 'ONGOING'
  | 'DONE'
  | 'ON HOLD'

// Plan lifecycle status
export type PlanDocStatus = 'draft' | 'published' | 'for_revision' | 'rejected'

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
  workingDays: number
  dayMarks: DayMark[]
}

export interface ApproverSlot {
  name: string
  role: string
  remarks: string
  signatureImage?: string
  approvedAt?: string
  sentForRevision?: boolean
  revisionReason?: string
}

export interface ApprovalSection {
  preparedBy: ApproverSlot
  reviewedBy: ApproverSlot
  approvedBy1: ApproverSlot
  approvedBy2: ApproverSlot
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
  additionalPersons?: AdditionalPerson[]
  approvals: ApprovalSection
  activities: ActivityRow[]
  months: MonthConfig[]
  otDays: string[]
  targetDate?: string        // YYYY-MM-DD
  status: PlanDocStatus
  versionHistory: VersionEntry[]
  publishedAt?: string
}

// Self Check TR
export interface SelfCheckItem {
  no: number
  checkpoint: string
  expectedResult: string
  selfCheck1: string
  selfCheck2: string
  tr1: string
  tr2: string
  remarks: string
}

export const SELF_CHECK_DEFAULTS: SelfCheckItem[] = [
  { no: 1, checkpoint: 'Basic Requirement', expectedResult: 'Title should have input', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 2, checkpoint: 'Core Team Input', expectedResult: 'Roles / PIC should have input', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 3, checkpoint: 'Activity Details', expectedResult: 'Activities with input and should be detailed', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 4, checkpoint: 'Activity PIC', expectedResult: 'PIC per Activity should be indicated', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 5, checkpoint: 'Activity Schedule', expectedResult: 'With exact date input & plotted', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 6, checkpoint: 'Legend/s', expectedResult: 'Legend should be correct', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 7, checkpoint: 'Template Version', expectedResult: 'Latest version', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 8, checkpoint: 'Date Format', expectedResult: 'YYYY-MM-DD', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 9, checkpoint: 'Signatures', expectedResult: 'Should be complete / at least with PIC Signature', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
  { no: 10, checkpoint: 'NG Result', expectedResult: 'Should be logged/updated in Quality Log', selfCheck1: '', selfCheck2: '', tr1: '', tr2: '', remarks: '' },
]

export interface SelfCheckTR {
  selfCheckPIC: string
  trPIC: string
  items: SelfCheckItem[]
  versionHistory: { version: string; reason: string; date: string; updatedBy: string }[]
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
