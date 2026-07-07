import type { TourStep } from '../components/TourGuide'

const dashboardSteps: TourStep[] = [
  {
    title: 'Welcome to Activity Planning!',
    content:
      'This quick tour walks you through the key features. You can skip at any time and reopen it later using the ? button in the header.',
  },
  {
    target: '#tour-tab-plans',
    title: 'Plans Tab',
    content:
      'The Plans tab lists all activity plans. Each card shows the plan title, IT number, version, status, approval progress, and assigned PIC.',
    position: 'bottom',
  },
  {
    target: '#tour-new-plan',
    title: 'Creating a New Plan',
    content:
      'Click "+ New Plan" to create a new activity plan. You\'ll choose between a Development Plan (5 phases) or a Support Plan (5 phases).',
    position: 'bottom',
  },
  {
    target: '#tour-plan-filters',
    title: 'Filtering Plans',
    content:
      'Use the type buttons (All Types / Development / Support) and the Status dropdown to filter the list. You can also search by title or IT number.',
    position: 'bottom',
  },
  {
    target: '#tour-first-plan',
    title: 'Reading a Plan Card',
    content:
      'Each card shows: status badge (Draft / Ongoing Approval / Published), project status (On Time / Delayed), progress bar, approval dots (how many signatures collected), and the assigned PIC.',
    position: 'bottom',
  },
  {
    target: '#tour-tab-analytics',
    title: 'Analytics Tab',
    content:
      'The Analytics tab gives a group-level performance overview for SMART, DEV, and NETWORK teams — showing average progress and how many plans are On Time, Delayed, or Complete.',
    position: 'bottom',
  },
  {
    target: '#tour-tab-requests',
    title: 'Requests Tab',
    content:
      'Log activity requests here before creating a formal plan. Once a request is ready, click "Make Plan" to turn it into a full activity plan automatically.',
    position: 'bottom',
  },
  {
    target: '#tour-tab-settings',
    title: 'Settings — Approvers & Holidays',
    content:
      'Manage the list of approvers (used in plan approval dropdowns) and add company holidays that are automatically excluded from working-day calculations.',
    position: 'bottom',
  },
]

export default dashboardSteps
