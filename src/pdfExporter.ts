import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ActivityPlan, SelfCheckTR } from './types'
import { calcAutoProgress } from './utils'

// ── Palette ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const NAVY:        RGB = [20,  52,  90]
const BLUE:        RGB = [37,  99,  235]
const PHASE_BG:    RGB = [30,  64,  175]
const PHASE_TEXT:  RGB = [255, 255, 255]
const WHITE:       RGB = [255, 255, 255]
const ALT_ROW:     RGB = [248, 250, 255]
const BORDER:      RGB = [209, 213, 219]
const TEXT_DARK:   RGB = [30,  40,  60]
const TEXT_GRAY:   RGB = [100, 116, 139]
const APPR_HDR_BG: RGB = [219, 234, 254]
const APPR_BOX_BG: RGB = [248, 250, 255]
const APPR_BORDER: RGB = [147, 197, 253]
const SEC_BG:      RGB = [239, 246, 255]

const STATUS_FILL: Record<string, RGB> = {
  'DONE':            [209, 250, 229],
  'ONGOING':         [219, 234, 254],
  'ON HOLD':         [254, 243, 199],
  'NOT YET STARTED': [243, 244, 246],
}

// ── Page constants ────────────────────────────────────────────────────────────
const PW = 297   // A4 landscape mm
const PH = 210
const ML = 12    // left margin
const MR = 12    // right margin
const MW = PW - ML - MR  // 273 usable width
const HDR_H = 15

// ── Helpers ───────────────────────────────────────────────────────────────────
const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2])
const draw = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
const txt  = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2])

function pageHeader(doc: jsPDF, plan: ActivityPlan) {
  fill(doc, NAVY)
  doc.rect(0, 0, PW, HDR_H, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  txt(doc, WHITE)
  doc.text('ACTIVITY PLAN', ML, HDR_H - 4)

  const meta = [
    plan.itNumber || null,
    `v${plan.documentVersion}`,
    plan.type === 'development' ? 'Development' : 'Support',
    plan.groupType || null,
  ].filter(Boolean).join('   ·   ')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(meta, PW - MR, HDR_H - 4, { align: 'right' })
}

function pageFooter(doc: jsPDF) {
  const n = (doc as any).internal.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  txt(doc, TEXT_GRAY)
  doc.text(
    `Page ${n}   ·   Generated ${new Date().toLocaleDateString('en-CA')}`,
    PW / 2, PH - 4, { align: 'center' },
  )
}

function sectionLabel(doc: jsPDF, label: string, y: number): number {
  fill(doc, SEC_BG)
  draw(doc, APPR_BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, y, MW, 6, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  txt(doc, BLUE)
  doc.text(label.toUpperCase(), ML + 3, y + 4.2)
  return y + 6
}

function finalY(doc: jsPDF, fallback: number): number {
  return (doc as any).lastAutoTable?.finalY ?? fallback
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportToPDF(plan: ActivityPlan, selfCheck: SelfCheckTR) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // ─── Page 1: Plan ──────────────────────────────────────────────────────────
  pageHeader(doc, plan)
  pageFooter(doc)

  let y = HDR_H + 4
  const persons = plan.persons as any
  const personsList = plan.personsList ?? []
  const _stk = plan.stakeholders ?? []
  const picName = _stk.length > 0
    ? (_stk.find(s => s.roles.some(r => ['Support PIC', 'Main Support', 'Developer'].includes(r)))?.name ?? _stk[0]?.name ?? '')
    : personsList.length > 0
      ? (personsList.find(p => ['Support PIC', 'Main Support', 'Developer'].includes(p.role))?.name ?? personsList[0]?.name ?? '')
      : plan.type === 'development'
        ? (persons.developer || persons.requestor || '')
        : (persons.smartMember || persons.requestor || '')

  // Plan Info ─────────────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Plan Information', y) + 2

  const LEFT: [string, string][] = [
    ['Title',     plan.title || '—'],
    ['IT Number', plan.itNumber || '—'],
    ['Type',      plan.type === 'development' ? 'Development' : 'Support'],
    ['Group',     plan.groupType || '—'],
  ]
  const RIGHT: [string, string][] = [
    ['Target Date', plan.targetDate || '—'],
    ['Doc Status',  plan.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())],
    ['PIC',         picName || '—'],
    ['Version',     plan.documentVersion],
  ]
  const ROW_H = 5.5
  const LBL_W = 25
  const HALF = MW / 2

  LEFT.forEach(([label, value], i) => {
    const ry = y + i * ROW_H
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(doc, TEXT_GRAY)
    doc.text(label + ':', ML, ry + 3.5)
    doc.setFont('helvetica', 'normal'); txt(doc, TEXT_DARK)
    doc.text(String(value), ML + LBL_W, ry + 3.5)
  })
  RIGHT.forEach(([label, value], i) => {
    const ry = y + i * ROW_H
    const rx = ML + HALF
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(doc, TEXT_GRAY)
    doc.text(label + ':', rx, ry + 3.5)
    doc.setFont('helvetica', 'normal'); txt(doc, TEXT_DARK)
    doc.text(String(value), rx + LBL_W, ry + 3.5)
  })
  y += LEFT.length * ROW_H + 3

  // Persons Involved ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Persons Involved', y) + 2

  const stakeholders = plan.stakeholders ?? []
  const allPersons: [string, string][] = stakeholders.length > 0
    ? stakeholders.filter(s => s.name?.trim()).map(s => [s.roles.join(' / ') || '—', s.name])
    : personsList.length > 0
      ? personsList.filter(p => p.name?.trim()).map(p => [p.role, p.name])
      : (() => {
          const core: [string, string][] = plan.type === 'development'
            ? [['Requestor', persons.requestor], ['Designer', persons.designer], ['Developer', persons.developer], ['SE', persons.se], ['PM', persons.pm]]
            : [['Requestor', persons.requestor], ['PIC', persons.smartMember], ['SE', persons.se], ['PM', persons.pm]]
          const extra: [string, string][] = (plan.additionalPersons ?? []).map(p => [p.role, p.name])
          return [...core, ...extra].filter(([, v]) => v)
        })()
  const PCOLS = Math.min(allPersons.length, 6) || 1
  const PCOL_W = MW / PCOLS

  allPersons.slice(0, 12).forEach(([role, name], i) => {
    const col = i % 6
    const row = Math.floor(i / 6)
    const px = ML + col * PCOL_W
    const py = y + row * 8.5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); txt(doc, TEXT_GRAY)
    doc.text(String(role) + ':', px, py + 3)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(doc, TEXT_DARK)
    doc.text(String(name || '—'), px, py + 7)
  })
  y += Math.ceil(allPersons.slice(0, 12).length / 6) * 8.5 + 3

  // Activity Table ────────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Activity Plan', y) + 1

  const phaseRows = new Set<number>()
  const actBody = plan.activities.map((act, idx) => {
    if (act.isPhase) {
      phaseRows.add(idx)
      const ps = { fillColor: PHASE_BG, textColor: PHASE_TEXT, fontStyle: 'bold' as const }
      return [
        { content: act.number, styles: ps },
        { content: act.name, colSpan: 10, styles: ps },
      ]
    }
    const pic0 = act.picEntries?.[0]
    const raci = pic0?.raci
    const prog = act.autoProgress !== false ? calcAutoProgress(act) : act.progress
    return [
      act.number,
      act.name,
      pic0?.pic || '—',
      { content: raci?.r ? '●' : '', styles: { halign: 'center' as const } },
      { content: raci?.a ? '●' : '', styles: { halign: 'center' as const } },
      { content: raci?.c ? '●' : '', styles: { halign: 'center' as const } },
      { content: raci?.i ? '●' : '', styles: { halign: 'center' as const } },
      act.status,
      { content: `${prog}%`, styles: { halign: 'center' as const } },
      { content: String(act.mh || ''), styles: { halign: 'center' as const } },
      { content: String(act.workingDays || ''), styles: { halign: 'center' as const } },
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [[
      { content: '#', styles: { halign: 'center' } },
      'Activity',
      'PIC',
      { content: 'R', styles: { halign: 'center' } },
      { content: 'A', styles: { halign: 'center' } },
      { content: 'C', styles: { halign: 'center' } },
      { content: 'I', styles: { halign: 'center' } },
      'Status',
      { content: '%', styles: { halign: 'center' } },
      { content: 'MH', styles: { halign: 'center' } },
      { content: 'Days', styles: { halign: 'center' } },
    ]],
    body: actBody,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      lineColor: BORDER,
      lineWidth: 0.2,
      textColor: TEXT_DARK,
      font: 'helvetica',
    },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0:  { cellWidth: 10 },
      1:  { cellWidth: 85 },
      2:  { cellWidth: 38 },
      3:  { cellWidth: 8  },
      4:  { cellWidth: 8  },
      5:  { cellWidth: 8  },
      6:  { cellWidth: 8  },
      7:  { cellWidth: 30 },
      8:  { cellWidth: 13 },
      9:  { cellWidth: 12 },
      10: { cellWidth: 13 },
    },
    willDrawCell: (data) => {
      if (data.section !== 'body') return
      if (phaseRows.has(data.row.index)) return
      if (data.column.index === 7) {
        const c = STATUS_FILL[String(data.cell.raw)]
        if (c) {
          doc.setFillColor(c[0], c[1], c[2])
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F')
        }
      }
    },
    didDrawPage: () => { pageHeader(doc, plan); pageFooter(doc) },
  })

  y = finalY(doc, y + 40) + 4

  // Approval Section ──────────────────────────────────────────────────────────
  const APR_H = 44
  const slots = [
    plan.approvals.preparedBy,
    plan.approvals.reviewedBy,
    plan.approvals.approvedBy1,
    plan.approvals.approvedBy2,
  ]

  if (y + APR_H + 14 > PH - 8) {
    doc.addPage()
    pageHeader(doc, plan)
    pageFooter(doc)
    y = HDR_H + 5
  }

  y = sectionLabel(doc, 'Approval', y) + 2

  const BOX_W = MW / 4
  slots.forEach((slot, i) => {
    const bx = ML + i * BOX_W
    const by = y

    // Box
    fill(doc, APPR_BOX_BG); draw(doc, APPR_BORDER)
    doc.setLineWidth(0.3)
    doc.rect(bx, by, BOX_W - 1, APR_H, 'FD')

    // Role header bar
    fill(doc, APPR_HDR_BG)
    doc.rect(bx, by, BOX_W - 1, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(doc, PHASE_BG)
    doc.text(slot.role, bx + (BOX_W - 1) / 2, by + 4.2, { align: 'center' })

    // Name
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); txt(doc, TEXT_DARK)
    const nameStr = slot.name || '—'
    doc.text(nameStr, bx + (BOX_W - 1) / 2, by + 12, { align: 'center' })

    // Signature area
    const SIG_TOP = by + 14
    const SIG_BOT = by + APR_H - 10
    const SIG_H = SIG_BOT - SIG_TOP
    if (slot.signatureImage) {
      try {
        doc.addImage(slot.signatureImage, 'PNG', bx + 4, SIG_TOP, BOX_W - 9, SIG_H, undefined, 'FAST')
      } catch { /* skip corrupt image */ }
    } else {
      draw(doc, BORDER); doc.setLineWidth(0.2)
      doc.setLineDashPattern([1, 1], 0)
      doc.line(bx + 8, SIG_TOP + SIG_H / 2, bx + BOX_W - 9, SIG_TOP + SIG_H / 2)
      doc.setLineDashPattern([], 0)
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); txt(doc, TEXT_GRAY)
      doc.text('No signature', bx + (BOX_W - 1) / 2, SIG_TOP + SIG_H / 2 - 1, { align: 'center' })
    }

    // Date + remarks
    const footY = by + APR_H - 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); txt(doc, TEXT_GRAY)
    const dateStr = slot.approvedAt ? slot.approvedAt.slice(0, 10) : '—'
    doc.text(`Date: ${dateStr}`, bx + 3, footY)
    if (slot.remarks) {
      const r = slot.remarks.length > 28 ? slot.remarks.slice(0, 28) + '…' : slot.remarks
      doc.text(`Rmks: ${r}`, bx + 3, footY + 4)
    }
  })

  // ─── Page 2: Self Check / TR ───────────────────────────────────────────────
  doc.addPage()
  pageHeader(doc, plan)
  pageFooter(doc)
  y = HDR_H + 4

  y = sectionLabel(doc, 'Self Check / Technical Review (TR)', y) + 2

  // PIC row
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(doc, TEXT_GRAY)
  doc.text('Self Check PIC:', ML, y + 3)
  doc.setFont('helvetica', 'normal'); txt(doc, TEXT_DARK)
  doc.text(selfCheck.selfCheckPIC || '—', ML + 28, y + 3)
  doc.setFont('helvetica', 'bold'); txt(doc, TEXT_GRAY)
  doc.text('TR PIC:', ML + 90, y + 3)
  doc.setFont('helvetica', 'normal'); txt(doc, TEXT_DARK)
  doc.text(selfCheck.trPIC || '—', ML + 103, y + 3)
  y += 7

  // Checkpoint table
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [[
      { content: 'No.', styles: { halign: 'center' } },
      'Checkpoint',
      'Expected Result',
      { content: 'SC 1st', styles: { halign: 'center' } },
      { content: 'SC 2nd', styles: { halign: 'center' } },
      { content: 'TR 1st', styles: { halign: 'center' } },
      { content: 'TR 2nd', styles: { halign: 'center' } },
      'Remarks',
    ]],
    body: selfCheck.items.map(item => {
      const resultStyle = (v: string) => ({
        halign: 'center' as const,
        textColor: v === 'NG' ? ([220, 38, 38] as RGB) : v === 'OK' ? ([22, 163, 74] as RGB) : TEXT_DARK,
        fontStyle: v === 'NG' || v === 'OK' ? ('bold' as const) : ('normal' as const),
      })
      return [
        { content: item.no, styles: { halign: 'center' as const } },
        item.checkpoint,
        item.expectedResult,
        { content: item.selfCheck1, styles: resultStyle(item.selfCheck1) },
        { content: item.selfCheck2, styles: resultStyle(item.selfCheck2) },
        { content: item.tr1, styles: resultStyle(item.tr1) },
        { content: item.tr2, styles: resultStyle(item.tr2) },
        item.remarks,
      ]
    }),
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      lineColor: BORDER,
      lineWidth: 0.2,
      textColor: TEXT_DARK,
    },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 40 },
      2: { cellWidth: 63 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 20 },
      6: { cellWidth: 20 },
      7: { cellWidth: 80 },
    },
    didDrawPage: () => { pageHeader(doc, plan); pageFooter(doc) },
  })

  y = finalY(doc, y + 40) + 5

  // Self Check version history ────────────────────────────────────────────────
  if (selfCheck.versionHistory.length > 0) {
    if (y + 20 > PH - 8) {
      doc.addPage(); pageHeader(doc, plan); pageFooter(doc); y = HDR_H + 5
    }
    y = sectionLabel(doc, 'Self Check Version History', y) + 1
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Version', 'Reason for Revision', 'Date', 'Updated By']],
      body: selfCheck.versionHistory.map(v => [v.version, v.reason, v.date, v.updatedBy]),
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER, lineWidth: 0.2, textColor: TEXT_DARK },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 120 }, 2: { cellWidth: 30 }, 3: { cellWidth: 60 } },
      alternateRowStyles: { fillColor: ALT_ROW },
      didDrawPage: () => { pageHeader(doc, plan); pageFooter(doc) },
    })
    y = finalY(doc, y + 20) + 5
  }

  // Plan version history ───────────────────────────────────────────────────────
  if (plan.versionHistory.length > 0) {
    if (y + 20 > PH - 8) {
      doc.addPage(); pageHeader(doc, plan); pageFooter(doc); y = HDR_H + 5
    }
    y = sectionLabel(doc, 'Plan Version History', y) + 1
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Version', 'Reason for Revision', 'Date', 'Updated By']],
      body: plan.versionHistory.map(v => [v.version, v.reason, v.date, v.by]),
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER, lineWidth: 0.2, textColor: TEXT_DARK },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 120 }, 2: { cellWidth: 30 }, 3: { cellWidth: 60 } },
      alternateRowStyles: { fillColor: ALT_ROW },
      didDrawPage: () => { pageHeader(doc, plan); pageFooter(doc) },
    })
  }

  const filename = `${plan.title || 'Activity-Plan'}_v${plan.documentVersion}.pdf`
    .replace(/[<>:"/\\|?*\n\r]/g, '-')
  doc.save(filename)
}
