import type { TourStep } from '../components/TourGuide'

const planViewerSteps: TourStep[] = [
  {
    title: "You've been asked to review a plan",
    content:
      'This is the approval view for the activity plan. Take a few seconds to learn where everything is before you sign. You can skip this tour at any time.',
  },
  {
    target: '#tour-approval-sidebar',
    title: 'Your Approval Slot',
    content:
      'The left sidebar shows all approval slots. Your slot is highlighted — your name may already be pre-filled. You can add remarks before signing.',
    position: 'right',
  },
  {
    target: '#tour-activity-table',
    title: 'Review the Activities',
    content:
      'The main area shows all planned activities, their RACI assignments, and the schedule (planned vs actual day marks). Scroll right to see the full calendar.',
    position: 'left',
  },
  {
    target: '#tour-viewer-tabs',
    title: 'Quality Checklist',
    content:
      'Click the "Self Check / TR" tab to review the quality checklist. All 10 checkpoints should be filled before a plan is submitted for approval.',
    position: 'bottom',
  },
  {
    target: '#tour-signature-area',
    title: 'Upload Your Signature',
    content:
      'Click the dashed area in your approval slot to upload a signature image (PNG or JPG). A clear handwritten signature on a white background works best.',
    position: 'right',
  },
  {
    target: '#tour-approve-btn',
    title: 'Approve or Send Back',
    content:
      'When satisfied, click "Save Approval" to sign the plan. If corrections are needed, click "Send for Revision" to notify the PIC with your remarks.',
    position: 'top',
  },
]

export default planViewerSteps
