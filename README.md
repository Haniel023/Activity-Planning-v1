# Activity Planning

A project management web application for creating, tracking, and approving structured activity plans — built for teams that need accountability, audit trails, and structured workflows.

---

## Features

- **Dual Plan Types** — Development and Support plans with tailored phase structures
- **RACI Matrix** — Per-activity role tracking (Responsible / Accountable / Consulted / Informed)
- **Approval Workflow** — Multi-stage signatures: Prepared By → Reviewed By → Approved By
- **Progress Tracking** — Auto-calculated from planned vs. actual day marks; status indicators (On Time / At Risk / Delayed / Complete)
- **Version Control** — Plan lifecycle: Draft → Published → For Revision, with version history
- **Self-Check & TR Checklist** — 10-point quality assurance checkpoint with per-version records
- **Excel Export** — Color-coded, formatted workbooks with activity tables, approval sections, and checklists
- **Shareable Viewer** — Read-only view link for approvers and stakeholders

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express.js v5 |
| Database | Better-SQLite3 |
| Export | ExcelJS, XLSX |
| Dev | Concurrently, ESLint |

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Run frontend + backend together
npm run dev:all
```

The app will be available at `http://localhost:5173` and the API at `http://localhost:3001`.

---

## Plan Workflow

```
New Plan
   │
   ▼
[DRAFT] ──────► Edit activities, RACI, schedules
   │
   ▼
[PUBLISHED] ───► Shared with approvers via view link
   │
   ├──► [FOR REVISION] ──► Edit → re-publish (version bumped)
   └──► [REJECTED]
```

---

## Project Structure

```
activity-planning/
├── src/
│   ├── components/       # Shared UI components
│   ├── pages/            # Dashboard, PlanEditor, PlanViewer
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Excel export, helpers
├── server/               # Express API + SQLite database
└── public/
```

---

## Plan Types

**Development Plan** phases: `Preparation → Design → Development → Testing → Implementation`

**Support Plan** phases: `Preparation → Investigation → Fixing → Documentation → Cascading`

---

## License

MIT
