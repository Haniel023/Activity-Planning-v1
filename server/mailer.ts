import nodemailer from 'nodemailer'

export interface PlanNotificationPayload {
  planId: string
  planTitle: string
  itNumber: string
  planType: string
  documentVersion: string
  viewLink: string
  publishedAt: string
  approvers: { name: string; role: string; email: string }[]
}

export async function sendPlanPublishedEmail(payload: PlanNotificationPayload): Promise<void> {
  // Read env vars at call time (not module load time) so .env.server is already loaded
  const SMTP_HOST   = process.env.SMTP_HOST   ?? ''
  const SMTP_PORT   = parseInt(process.env.SMTP_PORT ?? '25', 10)
  const SMTP_FROM   = process.env.SMTP_FROM   ?? 'activity-planning@ap.denso.com'
  const SMTP_TO     = process.env.SMTP_TO     ?? 'jether.haniel.de.leon.a5s@ap.denso.com'
  const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
  const SMTP_USER   = process.env.SMTP_USER   ?? ''
  const SMTP_PASS   = process.env.SMTP_PASS   ?? ''

  if (!SMTP_HOST) {
    console.warn('[mailer] SMTP_HOST not configured — skipping email notification')
    return
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
    tls: { rejectUnauthorized: false },
  })

  const approverLines = payload.approvers
    .map(a => `  • ${a.role}: ${a.name}${a.email ? ` <${a.email}>` : ''}`)
    .join('\n')

  const subject = `[ActivityPlan][SUBMITTED] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`

  // Plain-text body for readability + JSON block for Power Automate parsing
  const textBody = `
A new activity plan has been published and requires approval.

Plan Title   : ${payload.planTitle}
IT Number    : ${payload.itNumber || '—'}
Type         : ${payload.planType}
Version      : ${payload.documentVersion}
Published At : ${payload.publishedAt.slice(0, 19).replace('T', ' ')} UTC
View Link    : ${payload.viewLink}

Approvers:
${approverLines || '  (none assigned)'}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({
    from: SMTP_FROM,
    to: SMTP_TO,
    subject,
    text: textBody,
  })

  console.log(`[mailer] Plan published email sent → ${SMTP_TO} | "${subject}"`)
}

function makeTransporter() {
  const SMTP_HOST   = process.env.SMTP_HOST   ?? ''
  const SMTP_PORT   = parseInt(process.env.SMTP_PORT ?? '25', 10)
  const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
  const SMTP_USER   = process.env.SMTP_USER   ?? ''
  const SMTP_PASS   = process.env.SMTP_PASS   ?? ''
  if (!SMTP_HOST) return null
  return nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
    tls: { rejectUnauthorized: false },
  })
}

function smtpAddresses() {
  return {
    from: process.env.SMTP_FROM ?? 'activity-planning@ap.denso.com',
    to:   process.env.SMTP_TO   ?? 'jether.haniel.de.leon.a5s@ap.denso.com',
  }
}

// ── Re-submitted after revision — notify PROJECT LEADER ─────────────────────

export async function sendResubmittedEmail(payload: PlanNotificationPayload): Promise<void> {
  const transporter = makeTransporter()
  if (!transporter) {
    console.warn('[mailer] SMTP_HOST not configured — skipping resubmit email')
    return
  }
  const { from, to } = smtpAddresses()
  const subject = `[ActivityPlan][RESUBMITTED] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`
  const approverLines = payload.approvers
    .map(a => `  • ${a.role}: ${a.name}${a.email ? ` <${a.email}>` : ''}`)
    .join('\n')
  const textBody = `
The activity plan has been revised and re-submitted for approval.

Plan Title   : ${payload.planTitle}
IT Number    : ${payload.itNumber || '—'}
Type         : ${payload.planType}
Version      : ${payload.documentVersion}
View Link    : ${payload.viewLink}

Approvers:
${approverLines || '  (none assigned)'}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({ from, to, subject, text: textBody })
  console.log(`[mailer] Resubmit email sent → ${to} | "${subject}"`)
}

// ── Slot approved — notify next approver ────────────────────────────────────

export interface SlotApprovedPayload {
  planId: string
  planTitle: string
  itNumber: string
  viewLink: string
  approvedSlot: { name: string; role: string }
  nextSlot: { name: string; role: string; email: string }
}

export async function sendSlotApprovedEmail(payload: SlotApprovedPayload): Promise<void> {
  const transporter = makeTransporter()
  if (!transporter) {
    console.warn('[mailer] SMTP_HOST not configured — skipping slot-approved email')
    return
  }
  const { from, to } = smtpAddresses()
  const subject = `[ActivityPlan][SLOT_APPROVED] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`
  const textBody = `
${payload.approvedSlot.role} (${payload.approvedSlot.name}) has approved the activity plan.
Next to sign: ${payload.nextSlot.role} — ${payload.nextSlot.name}

Plan Title : ${payload.planTitle}
IT Number  : ${payload.itNumber || '—'}
View Link  : ${payload.viewLink}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({ from, to, subject, text: textBody })
  console.log(`[mailer] Slot-approved email sent | "${subject}"`)
}

// ── Fully approved — notify PIC ─────────────────────────────────────────────

export interface FullyApprovedPayload {
  planId: string
  planTitle: string
  itNumber: string
  viewLink: string
  pic: { name: string; email: string }
}

export async function sendFullyApprovedEmail(payload: FullyApprovedPayload): Promise<void> {
  const transporter = makeTransporter()
  if (!transporter) {
    console.warn('[mailer] SMTP_HOST not configured — skipping fully-approved email')
    return
  }
  const { from, to } = smtpAddresses()
  const subject = `[ActivityPlan][FULLY_APPROVED] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`
  const textBody = `
All approvals are complete for the activity plan below.

Plan Title : ${payload.planTitle}
IT Number  : ${payload.itNumber || '—'}
View Link  : ${payload.viewLink}
PIC        : ${payload.pic.name}${payload.pic.email ? ` <${payload.pic.email}>` : ''}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({ from, to, subject, text: textBody })
  console.log(`[mailer] Fully-approved email sent | "${subject}"`)
}

// ── Sent for revision — notify PIC ──────────────────────────────────────────

export interface RevisionPayload {
  planId: string
  planTitle: string
  itNumber: string
  viewLink: string
  reason: string
  by: string
  pic: { name: string; email: string }
}

export async function sendRevisionEmail(payload: RevisionPayload): Promise<void> {
  const transporter = makeTransporter()
  if (!transporter) {
    console.warn('[mailer] SMTP_HOST not configured — skipping revision email')
    return
  }
  const { from, to } = smtpAddresses()
  const subject = `[ActivityPlan][FOR_REVISION] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`
  const textBody = `
The activity plan has been sent back for revision.

Plan Title : ${payload.planTitle}
IT Number  : ${payload.itNumber || '—'}
Sent by    : ${payload.by}
Reason     : ${payload.reason || 'No reason given'}
View Link  : ${payload.viewLink}
PIC        : ${payload.pic.name}${payload.pic.email ? ` <${payload.pic.email}>` : ''}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({ from, to, subject, text: textBody })
  console.log(`[mailer] Revision email sent | "${subject}"`)
}

// ── Rejected — notify PIC ────────────────────────────────────────────────────

export interface RejectedPayload {
  planId: string
  planTitle: string
  itNumber: string
  viewLink: string
  reason: string
  by: string
  pic: { name: string; email: string }
}

export async function sendRejectedEmail(payload: RejectedPayload): Promise<void> {
  const transporter = makeTransporter()
  if (!transporter) {
    console.warn('[mailer] SMTP_HOST not configured — skipping rejected email')
    return
  }
  const { from, to } = smtpAddresses()
  const subject = `[ActivityPlan][REJECTED] ${payload.planTitle}${payload.itNumber ? ` | ${payload.itNumber}` : ''}`
  const textBody = `
The activity plan has been rejected.

Plan Title : ${payload.planTitle}
IT Number  : ${payload.itNumber || '—'}
Rejected by: ${payload.by}
Reason     : ${payload.reason || 'No reason given'}
View Link  : ${payload.viewLink}
PIC        : ${payload.pic.name}${payload.pic.email ? ` <${payload.pic.email}>` : ''}

---
JSON_PAYLOAD_START
${JSON.stringify(payload, null, 2)}
JSON_PAYLOAD_END
`.trim()

  await transporter.sendMail({ from, to, subject, text: textBody })
  console.log(`[mailer] Rejected email sent | "${subject}"`)
}
