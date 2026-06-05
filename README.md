<div align="center">

# Activity Planning

**A structured activity plan management system with multi-stage approval workflows, RACI tracking, and full audit trails.**

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Express](https://img.shields.io/badge/Express-v5-000000?style=flat-square&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)

</div>

---

## Overview

Activity Planning is a full-stack internal tool for structuring, approving, and tracking development and support activity plans. It replaces manual Excel-based processes with a digital workflow — from plan creation and RACI assignment through multi-stage approval, version history, and progress tracking.

Built for Windows/IIS deployment with Power Automate integration for Microsoft Teams notifications.

---

## Features

### Plan Management
- **Dual plan types** — Development and Support plans with predefined phase structures
- **RACI matrix** — Per-activity role assignments (Responsible, Accountable, Consulted, Informed)
- **Day-level scheduling** — Mark planned vs. actual days per activity; progress auto-calculated
- **Version control** — Full version history with snapshots on every state transition
- **Self-Check & Technical Review** — 10-point QA checklist recorded per version

### Approval Workflow
- **Multi-stage signatures** — Prepared By → Reviewed By → Approved By (up to 3 approvers)
- **Email notifications** — Automatic emails at each workflow transition via SMTP
- **Revision cycle** — Approvers can send back with remarks; PICs revise and resubmit
- **Shareable viewer** — Read-only view link for approvers; digital signature support

### Progress & Insights
- **Status indicators** — On Time / At Risk / Delayed / Complete / Not Yet Started per activity
- **Plan insights panel** — Progress bars, milestone tracking, risk indicators
- **Progress log** — Timestamped remarks on published plans per activity

### Export & Integration
- **Excel export** — Color-coded workbooks with activities, approvals, and checklists (ExcelJS)
- **PDF export** — Formatted plan documents (jsPDF)
- **Power Automate** — Polling endpoint for Teams notification dispatch (5 flow templates)
- **Holiday calendar** — Company holidays excluded from day calculations

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express.js v5, Node.js |
| Database | Better-SQLite3 (SQLite) |
| Mailer | Nodemailer |
| Export | ExcelJS, jsPDF, jsPDF-autotable |
| Process Manager | PM2 |
| Web Server | IIS (reverse proxy) |

---

## Plan Lifecycle

```
                          ┌─────────────────────────────┐
                          │           NEW PLAN           │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │            DRAFT              │
                         │  Edit activities, RACI,       │
                         │  schedule, self-check         │
                         └──────────────┬────────────────┘
                                        │  Submit
                                        ▼
                         ┌───────────────────────────────┐
                         │       ONGOING APPROVAL        │
                         │  Approvers sign sequentially  │
                         │  Emails sent per signature    │
                         └───┬───────────────┬───────────┘
                             │               │
                    All signed               │ Send back
                             │               ▼
                             │  ┌────────────────────────┐
                             │  │      FOR REVISION      │◄─── Version bumped
                             │  │  PIC edits & resubmits │
                             │  └────────────┬───────────┘
                             │               │ Resubmit
                             ▼               ▼
                         ┌───────────────────────────────┐
                         │           PUBLISHED           │
                         │  Progress tracking active     │
                         │  Updates log enabled          │
                         └───────────────────────────────┘

         At any stage: CANCELLED (by PIC) or REJECTED (by approver)
```

### Plan Types & Phases

| Type | Phases |
|---|---|
| **Development** | Preparation → Design → Development → Testing → Implementation |
| **Support** | Preparation → Investigation → Fixing → Documentation → Cascading |

---

## Project Structure

```
activity-planning/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx        # Plan list, analytics, requests, admin
│   │   ├── NewPlan.tsx          # Plan creation wizard
│   │   ├── PlanEditor.tsx       # Draft/revision editor
│   │   └── PlanViewer.tsx       # Read-only approval view
│   ├── components/
│   │   ├── ActivityTable.tsx    # Activity grid with RACI and day marks
│   │   ├── ApprovalSection.tsx  # Signature slots
│   │   ├── ApproverMaintenance.tsx
│   │   ├── SelfCheckTRView.tsx  # QA checklist
│   │   ├── InsightsPanel.tsx    # Progress analytics
│   │   ├── UpdatesLog.tsx       # Progress remarks
│   │   ├── HolidayManager.tsx   # Holiday calendar
│   │   ├── PlanHeader.tsx       # Plan metadata
│   │   └── ConfirmModal.tsx
│   ├── api.ts                   # All backend fetch calls
│   ├── types.ts                 # TypeScript interfaces
│   ├── utils.ts                 # Date helpers, day calculations
│   ├── exporter.ts              # Excel export (ExcelJS)
│   ├── pdfExporter.ts           # PDF export (jsPDF)
│   ├── planDiff.ts              # Version comparison
│   └── planInsights.ts          # Progress & risk analytics
├── server/
│   ├── index.ts                 # Express server & all REST endpoints
│   ├── db.ts                    # SQLite schema & initialization
│   └── mailer.ts                # Nodemailer email templates
├── public/
├── dist/                        # Built frontend
├── server-dist/                 # Built backend
└── activity_plans.db            # SQLite database (gitignored)
```

---

## Database Schema

| Table | Description |
|---|---|
| `plans` | Activity plans with JSON data payload |
| `plan_updates` | Progress remarks on published plans |
| `plan_versions` | Full version snapshots for audit trail |
| `company_holidays` | Holiday calendar |
| `activity_requests` | Activity backlog / request queue |
| `approvers` | Master list of approvers (name, email, position) |
| `notifications` | Power Automate polling queue |

---

## API Reference

### Plans
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/plans` | List all plans |
| `POST` | `/api/plans` | Create new plan |
| `GET` | `/api/plans/:id` | Get full plan + self-check |
| `PUT` | `/api/plans/:id` | Update plan |
| `DELETE` | `/api/plans/:id` | Delete plan |
| `POST` | `/api/plans/:id/publish` | Submit for approval |
| `POST` | `/api/plans/:id/approve` | Record signature |
| `POST` | `/api/plans/:id/revision` | Send back for revision |
| `POST` | `/api/plans/:id/republish` | Resubmit after revision |
| `POST` | `/api/plans/:id/reject` | Reject plan |
| `POST` | `/api/plans/:id/cancel` | Cancel plan |
| `POST` | `/api/plans/:id/save-progress` | Save actual day marks |

### Supporting Resources
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/plans/:id/updates` | Progress remarks |
| `GET` | `/api/plans/:id/versions` | Version history |
| `GET/POST/PUT/DELETE` | `/api/requests` | Activity requests |
| `GET/POST/PUT/DELETE` | `/api/approvers` | Approver master list |
| `GET/POST/DELETE` | `/api/holidays` | Company holidays |
| `GET` | `/api/notifications/pending` | Power Automate poll |
| `POST` | `/api/notifications/:id/ack` | Mark dispatched |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Development

```bash
# Install dependencies
npm install

# Start frontend (port 5173) and backend (port 3001) together
npm run dev:all
```

### Environment Variables

**`.env.server`** — Backend (SMTP, origins)
```env
SMTP_HOST=your.smtp.host
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
SMTP_FROM=no-reply@yourdomain.com
FRONTEND_ORIGIN=http://localhost:5173
```

**`.env.production`** — Frontend (API base URL)
```env
VITE_API_BASE=http://your-server-ip:1101
```

> **Note:** `.env.production` is loaded only during `npm run build` — not at runtime. Ensure `VITE_API_BASE` is set before building for production.

### Production Build

```bash
# Build frontend
npm run build

# Build backend
npm run build:server

# Start with PM2
pm2 start ecosystem.config.js
```

---

## Deployment

The application runs on **IIS + PM2** in production:

| Service | Port |
|---|---|
| Frontend (IIS static) | 1011 |
| Backend API (PM2 / Express) | 1101 |

IIS is configured as a reverse proxy — the frontend is served as static files and API calls are proxied to the Express backend managed by PM2 (Backend Hub).

See `POWER_AUTOMATE_SETUP.md` for setting up the 5 Teams notification flows.

---

## Email Notifications

Sent automatically at each workflow transition:

| Trigger | Recipients |
|---|---|
| Plan submitted | All approvers |
| One approver signed | Next approver in sequence |
| All approvers signed | PIC (plan auto-published) |
| Sent for revision | PIC |
| Resubmitted | All approvers |
| Plan rejected | PIC |

All emails include a structured JSON payload for Power Automate parsing.

---

<div align="center">

Built for internal team use · SMART / DEV / NETWORK groups

</div>
