import { Workbook } from 'exceljs'
import type { ActivityPlan, MonthConfig, SelfCheckTR } from './types'
import { monthLabel, daysInMonth, toDateStr, isWeekend, dayOfWeekAbbr, dayNumber, calcAutoProgress } from './utils'

// ── Colour palette ──────────────────────────────────────────────────────────
const C = {
  colHdr:   'FFC9D6F7',   // column header blue
  monthHdr: 'FFE0EFFE',   // month header light blue
  wkHdr:    'FFE8F0FE',   // week/day sub-header
  phase:    'FFDBEAFE',   // phase row
  phaseTxt: 'FF1E40AF',
  weekend:  'FFE5E7EB',   // weekend col
  ot:       'FFFEF3C7',   // OT weekend
  planSym:  'FF1D4ED8',   // plan ○ color
  actualSym:'FFEA580C',   // actual ● color
  scYellow: 'FFFFF2CC',   // Self Check header
  trBlue:   'FFDDEBF7',   // TR header
  verGreen: 'FFE2EFDA',   // version control
  altRow:   'FFF8FAFF',   // light alternating
  approvalBg:'FFF0F4FF',
  done:     'FFD1FAE5',
  ongoing:  'FFDBEAFE',
  hold:     'FFFEF3C7',
  border:   'FFD1D5DB',
}

type XBorder = { style: 'thin'; color: { argb: string } }
const thin = (): XBorder => ({ style: 'thin', color: { argb: C.border } })
const BORDER = { top: thin(), left: thin(), bottom: thin(), right: thin() }

import type ExcelJS from 'exceljs'
type WS = ExcelJS.Worksheet
type Cell = ExcelJS.Cell

function sc(cell: Cell, options?: {
  bold?: boolean; italic?: boolean; center?: boolean; wrap?: boolean
  bg?: string; fontColor?: string; fontSize?: number; border?: boolean; indent?: number
}) {
  const o = options ?? {}
  cell.font = {
    name: 'Calibri', size: o.fontSize ?? 8,
    bold: o.bold ?? false, italic: o.italic ?? false,
    color: o.fontColor ? { argb: o.fontColor } : undefined,
  }
  cell.alignment = {
    horizontal: o.center ? 'center' : 'left',
    vertical: 'middle',
    wrapText: o.wrap ?? false,
    indent: o.indent,
  }
  if (o.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.bg } }
  if (o.border !== false) cell.border = BORDER
}

function allDates(months: MonthConfig[]): string[] {
  const d: string[] = []
  for (const m of months) {
    const days = daysInMonth(m.year, m.month)
    for (let i = 1; i <= days; i++) d.push(toDateStr(m.year, m.month, i))
  }
  return d
}

// ── Activity Plan Sheet ──────────────────────────────────────────────────────
export async function buildActivityPlanSheet(ws: WS, plan: ActivityPlan, wb: Workbook) {
  const { months, activities, approvals, type, title, documentVersion, otDays } = plan
  let activityStartRow = 0   // set after all header rows — used for freeze pane
  const dates = allDates(months)
  const otSet = new Set(otDays)

  // Fixed columns: No(1) Activity(2) PIC(3) R(4) A(5) C(6) I(7) Status(8) %(9) MH(10) Days(11) Sched(12)
  // Then one col per date starting at 13
  const FIXED = 12
  const dateCol = (i: number) => FIXED + 1 + i   // 1-indexed exceljs col

  // ── Column widths ─────────────────────────────────────────────────────────
  ws.getColumn(1).width = 6      // #
  ws.getColumn(2).width = 28     // Activity
  ws.getColumn(3).width = 14     // PIC
  ws.getColumn(4).width = 4; ws.getColumn(5).width = 4; ws.getColumn(6).width = 4; ws.getColumn(7).width = 4
  ws.getColumn(8).width = 16     // Status
  ws.getColumn(9).width = 5      // %
  ws.getColumn(10).width = 7     // MH
  ws.getColumn(11).width = 5     // Days
  ws.getColumn(12).width = 7     // Sched
  dates.forEach((_, i) => { ws.getColumn(dateCol(i)).width = 3.5 })

  let r = 1

  // ── Row 1: document version ───────────────────────────────────────────────
  ws.getRow(r).height = 14
  const vCell = ws.getCell(r, dateCol(dates.length - 1) - 2)
  vCell.value = `Document Version : ${documentVersion}`
  sc(vCell, { bold: true, center: true })
  r++

  // ── Row 2: title + approval labels ───────────────────────────────────────
  ws.getRow(r).height = 14
  const titleLabel = type === 'development' ? 'Project Title:' : 'Support Title:'
  const tCell = ws.getCell(r, 1); tCell.value = titleLabel; sc(tCell, { bold: true })
  const tVal = ws.getCell(r, 2); tVal.value = title; sc(tVal, { bold: true, fontColor: C.phaseTxt })
  ws.mergeCells(r, 2, r, 7)

  const apCols = [14, 19, 24, 29, 34]
  const apLabels = ['PREPARED BY', 'REVIEWED BY', 'APPROVED BY', 'APPROVED BY', 'REMARKS / COMMENTS']
  apLabels.forEach((lbl, i) => {
    const c = ws.getCell(r, apCols[i])
    c.value = lbl; sc(c, { bold: true, center: true, bg: C.approvalBg, border: true })
    if (i < 4) ws.mergeCells(r, apCols[i], r, apCols[i] + 3)
  })
  r++

  // ── Persons involved rows + approver names ────────────────────────────────
  const persons = plan.persons as unknown as Record<string, string>
  const personRows = type === 'development'
    ? [['Requestor:', persons.requestor], ['Designer:', persons.designer], ['Developer:', persons.developer], ['SE:', persons.se], ['Project Manager:', persons.pm]]
    : [['Requestor:', persons.requestor], ['SMART Member:', persons.smartMember], ['SE:', persons.se], ['Project Manager:', persons.pm]]

  const approvers = [approvals.preparedBy, approvals.reviewedBy, approvals.approvedBy1, approvals.approvedBy2]
  personRows.forEach(([label, value], i) => {
    ws.getRow(r).height = 13
    const lc = ws.getCell(r, 1); lc.value = label; sc(lc)
    const vc = ws.getCell(r, 2); vc.value = value ?? ''; sc(vc); ws.mergeCells(r, 2, r, 7)
    if (i < 4) { const nc = ws.getCell(r, apCols[i]); nc.value = approvers[i]?.name ?? ''; sc(nc, { center: true, bg: C.approvalBg, border: true }); ws.mergeCells(r, apCols[i], r, apCols[i] + 3) }
    r++
  })

  // Approval roles row + remarks
  ws.getRow(r).height = 13
  approvers.forEach((ap, i) => {
    const c = ws.getCell(r, apCols[i]); c.value = ap?.role ?? ''; sc(c, { bold: true, italic: true, center: true, bg: C.approvalBg, border: true })
    ws.mergeCells(r, apCols[i], r, apCols[i] + 3)
  })
  const combinedRemarks = [approvals.preparedBy, approvals.reviewedBy, approvals.approvedBy1, approvals.approvedBy2]
    .filter(s => s.remarks?.trim())
    .map(s => `[${s.role}] ${s.remarks}`)
    .join('\n')
  const remCell = ws.getCell(r, apCols[4]); remCell.value = combinedRemarks; sc(remCell, { bg: C.approvalBg, border: true })
  r++

  // Signature image row
  ws.getRow(r).height = 45
  approvers.forEach((ap, i) => {
    const borderCell = ws.getCell(r, apCols[i])
    sc(borderCell, { bg: C.approvalBg, border: true })
    ws.mergeCells(r, apCols[i], r, apCols[i] + 3)
    if (ap?.signatureImage) {
      try {
        const b64 = ap.signatureImage.includes('base64,')
          ? ap.signatureImage.split('base64,')[1]
          : ap.signatureImage
        const imgId = wb.addImage({ base64: b64, extension: 'png' })
        ws.addImage(imgId, {
          tl: { col: apCols[i] - 1, row: r - 1 } as any,
          ext: { width: 100, height: 40 },
          editAs: 'oneCell',
        })
      } catch { /* skip broken image */ }
    }
  })
  ws.getCell(r, apCols[4]).border = BORDER
  r++

  // Date approved row
  ws.getRow(r).height = 13
  approvers.forEach((ap, i) => {
    const c = ws.getCell(r, apCols[i])
    c.value = ap?.approvedAt ? new Date(ap.approvedAt).toLocaleDateString('en-CA') : ''
    sc(c, { center: true, italic: true, bg: C.approvalBg, border: true, fontColor: 'FF6B7280' })
    ws.mergeCells(r, apCols[i], r, apCols[i] + 3)
  })
  ws.getCell(r, apCols[4]).border = BORDER
  r++

  // ── Main column header ────────────────────────────────────────────────────
  ws.getRow(r).height = 16
  const fixedHdrs = ['No.', 'Activity', 'PIC', 'R', 'A', 'C', 'I', 'Status', '%', 'MH', 'Days', 'Schedule']
  fixedHdrs.forEach((h, ci) => {
    const c = ws.getCell(r, ci + 1); c.value = h; sc(c, { bold: true, center: true, bg: C.colHdr, border: true })
  })
  // Month spans
  let colOffset = FIXED + 1
  for (const m of months) {
    const span = daysInMonth(m.year, m.month)
    const c = ws.getCell(r, colOffset); c.value = monthLabel(m)
    sc(c, { bold: true, center: true, bg: C.monthHdr, border: true })
    if (span > 1) ws.mergeCells(r, colOffset, r, colOffset + span - 1)
    colOffset += span
  }
  r++

  // ── Day sub-header ────────────────────────────────────────────────────────
  ws.getRow(r).height = 26
  fixedHdrs.forEach((_, ci) => { const c = ws.getCell(r, ci + 1); sc(c, { bg: C.colHdr, border: true }) })
  dates.forEach((date, i) => {
    const col = dateCol(i); const c = ws.getCell(r, col); const wknd = isWeekend(date); const isOT = otSet.has(date)
    c.value = `${dayOfWeekAbbr(date)}\n${dayNumber(date)}${wknd && isOT ? '\nOT' : ''}`
    sc(c, { center: true, wrap: true, bg: wknd ? (isOT ? C.ot : C.weekend) : C.wkHdr, border: true, fontSize: 7, fontColor: wknd ? (isOT ? 'FF92400E' : 'FF6B7280') : 'FF374151' })
  })
  r++

  activityStartRow = r  // everything before this row is frozen

  // ── Activity rows ─────────────────────────────────────────────────────────
  for (const act of activities) {
    if (act.isPhase) {
      ws.getRow(r).height = 14
      const nc = ws.getCell(r, 1); nc.value = act.number; sc(nc, { bold: true, bg: C.phase, fontColor: C.phaseTxt, border: true })
      const nameC = ws.getCell(r, 2); nameC.value = act.name; sc(nameC, { bold: true, bg: C.phase, fontColor: C.phaseTxt, border: true })
      ws.mergeCells(r, 2, r, FIXED)
      dates.forEach((date, i) => {
        const c = ws.getCell(r, dateCol(i))
        sc(c, { bg: isWeekend(date) ? 'FFBFDBFE' : C.phase, border: true })
      })
      r++
    } else {
      const mm = new Map(act.dayMarks.map(m => [m.date, m]))
      const totalSpan = act.picEntries.length + 2   // PIC rows + Plan + Actual
      const actStartRow = r

      // Status row color
      const statusBg = act.status === 'DONE' ? C.done : act.status === 'ONGOING' ? C.ongoing : act.status === 'ON HOLD' ? C.hold : undefined

      // PIC rows
      act.picEntries.forEach((entry, ei) => {
        ws.getRow(r).height = 13
        const picC = ws.getCell(r, 3); picC.value = entry.pic; sc(picC, { border: true })
        const raci = [entry.raci.r, entry.raci.a, entry.raci.c, entry.raci.i]
        raci.forEach((v, ri) => { const c = ws.getCell(r, 4 + ri); c.value = v ? '✓' : ''; sc(c, { center: true, border: true, fontColor: v ? C.planSym : undefined, bold: v }) })
        // Sched cell empty
        ws.getCell(r, 12).border = BORDER
        // Calendar cells empty but with weekend color
        dates.forEach((date, i) => {
          const c = ws.getCell(r, dateCol(i)); const wknd = isWeekend(date); const isOT = otSet.has(date)
          sc(c, { bg: wknd ? (isOT ? C.ot : C.weekend) : (ei % 2 === 1 ? C.altRow : undefined), border: true })
        })
        if (ei === 0) {
          // Merge No, Activity, Status, %, MH, Days across all rows
          const no = ws.getCell(actStartRow, 1); no.value = act.number; sc(no, { border: true, center: true })
          const name = ws.getCell(actStartRow, 2); name.value = act.name; sc(name, { border: true })
          const effectivePct = act.autoProgress ? calcAutoProgress(act) : act.progress
          const st = ws.getCell(actStartRow, 8); st.value = `${effectivePct}% — ${act.status}`; sc(st, { center: true, border: true, bg: statusBg, fontSize: 7 })
          const pct = ws.getCell(actStartRow, 9); pct.value = effectivePct; sc(pct, { center: true, border: true, bg: statusBg })
          const mh = ws.getCell(actStartRow, 10); mh.value = act.mh; sc(mh, { center: true, border: true })
          const days = ws.getCell(actStartRow, 11); days.value = act.workingDays; sc(days, { center: true, border: true })
          if (totalSpan > 1) {
            ws.mergeCells(actStartRow, 1, actStartRow + totalSpan - 1, 1)
            ws.mergeCells(actStartRow, 2, actStartRow + totalSpan - 1, 2)
            ws.mergeCells(actStartRow, 8, actStartRow + totalSpan - 1, 8)
            ws.mergeCells(actStartRow, 9, actStartRow + totalSpan - 1, 9)
            ws.mergeCells(actStartRow, 10, actStartRow + totalSpan - 1, 10)
            ws.mergeCells(actStartRow, 11, actStartRow + totalSpan - 1, 11)
          }
        }
        r++
      })

      // Plan row
      ws.getRow(r).height = 12
      // Empty PIC+RACI cells
      for (let c2 = 3; c2 <= 11; c2++) { if (c2 !== 8 && c2 !== 9 && c2 !== 10 && c2 !== 11) ws.getCell(r, c2).border = BORDER }
      const planSched = ws.getCell(r, 12); planSched.value = 'Plan'; sc(planSched, { bold: true, center: true, fontColor: C.planSym, border: true })
      for (let c2 = 3; c2 <= 7; c2++) ws.getCell(r, c2).border = BORDER
      dates.forEach((date, i) => {
        const col = dateCol(i); const c = ws.getCell(r, col); const wknd = isWeekend(date); const isOT = otSet.has(date)
        const mark = mm.get(date)
        c.value = mark?.plan ? '○' : ''
        sc(c, { center: true, bold: mark?.plan ?? false, fontColor: mark?.plan ? C.planSym : undefined, bg: wknd ? (isOT ? C.ot : C.weekend) : undefined, border: true, fontSize: 9 })
      })
      r++

      // Actual row
      ws.getRow(r).height = 12
      for (let c2 = 3; c2 <= 7; c2++) ws.getCell(r, c2).border = BORDER
      const actSched = ws.getCell(r, 12); actSched.value = 'Actual'; sc(actSched, { bold: true, center: true, fontColor: C.actualSym, border: true })
      dates.forEach((date, i) => {
        const col = dateCol(i); const c = ws.getCell(r, col); const wknd = isWeekend(date); const isOT = otSet.has(date)
        const mark = mm.get(date)
        c.value = mark?.actual ? '●' : ''
        sc(c, { center: true, bold: mark?.actual ?? false, fontColor: mark?.actual ? C.actualSym : undefined, bg: wknd ? (isOT ? C.ot : C.weekend) : undefined, border: true, fontSize: 9 })
      })
      r++
    }
  }

  // ── MH Summary ─────────────────────────────────────────────────────────────
  r++
  const nonPhase = activities.filter(a => !a.isPhase)
  const plannedMH = nonPhase.reduce((s, a) => s + a.mh, 0)
  const doneMH = nonPhase.filter(a => a.status === 'DONE').reduce((s, a) => s + a.mh, 0)
  const ongoingMH = nonPhase.filter(a => a.status === 'ONGOING').reduce((s, a) => s + a.mh, 0)
  const progress = plannedMH > 0 ? (doneMH + ongoingMH * 0.5) / plannedMH : 0

  ;[
    ['OVERALL MH:', null],
    ['PLANNED MH', plannedMH],
    ['PROGRESS %:', null],
    ['ACTUAL:', `${(progress * 100).toFixed(1)}%`],
  ].forEach(([lbl, val]) => {
    ws.getRow(r).height = 13
    const lc = ws.getCell(r, 8); lc.value = lbl; sc(lc, { bold: !val, border: true })
    if (val != null) { const vc = ws.getCell(r, 10); vc.value = val; sc(vc, { center: true, border: true, bold: true }) }
    r++
  })

  // Freeze header rows and first 2 columns
  ws.views = [{
    state: 'frozen',
    xSplit: 2,
    ySplit: activityStartRow - 1,
    topLeftCell: `C${activityStartRow}`,
    activeCell: `C${activityStartRow}`,
  }]
}

// ── Self Check TR Sheet ──────────────────────────────────────────────────────
export async function buildSelfCheckSheet(ws: WS, sc2: SelfCheckTR) {
  ws.getColumn(1).width = 5
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 42
  ws.getColumn(4).width = 11; ws.getColumn(5).width = 11
  ws.getColumn(6).width = 11; ws.getColumn(7).width = 11
  ws.getColumn(8).width = 32

  let r = 1

  // Title header row
  ws.getRow(r).height = 18
  const titleCell = ws.getCell(r, 1); titleCell.value = 'SELF CHECK / TECHNICAL REVIEW (TR) CHECKLIST'
  sc(titleCell, { bold: true, center: true, bg: C.colHdr, border: true, fontSize: 10 })
  ws.mergeCells(r, 1, r, 8); r++

  // PIC labels
  ws.getRow(r).height = 14
  const scHdr = ws.getCell(r, 4); scHdr.value = 'Self Check'; sc(scHdr, { bold: true, center: true, bg: C.scYellow, border: true })
  ws.mergeCells(r, 4, r, 5)
  const trHdr = ws.getCell(r, 6); trHdr.value = 'Technical Review'; sc(trHdr, { bold: true, center: true, bg: C.trBlue, border: true })
  ws.mergeCells(r, 6, r, 7)
  ;[1, 2, 3, 8].forEach(c2 => { ws.getCell(r, c2).border = BORDER })
  r++

  ws.getRow(r).height = 13
  const scPIC = ws.getCell(r, 4); scPIC.value = `PIC: ${sc2.selfCheckPIC}`
  sc(scPIC, { center: true, italic: true, bg: C.scYellow, border: true })
  ws.mergeCells(r, 4, r, 5)
  const trPIC = ws.getCell(r, 6); trPIC.value = `PIC: ${sc2.trPIC}`
  sc(trPIC, { center: true, italic: true, bg: C.trBlue, border: true })
  ws.mergeCells(r, 6, r, 7)
  ;[1, 2, 3, 8].forEach(c2 => { ws.getCell(r, c2).border = BORDER })
  r++

  // Column headers
  ws.getRow(r).height = 14
  const headers = ['No.', 'Checkpoint', 'Expected Result', 'SC 1st Round', 'SC 2nd Round', 'TR 1st Round', 'TR 2nd Round', 'Remarks']
  const hdrBgs = [C.colHdr, C.colHdr, C.colHdr, C.scYellow, C.scYellow, C.trBlue, C.trBlue, C.colHdr]
  headers.forEach((h, i) => {
    const c2 = ws.getCell(r, i + 1); c2.value = h
    sc(c2, { bold: true, center: true, bg: hdrBgs[i], border: true, fontSize: 8 })
  })
  r++

  // Checkpoint rows
  sc2.items.forEach((item, idx) => {
    ws.getRow(r).height = 22
    const rowBg = idx % 2 === 0 ? undefined : C.altRow
    const vals = [item.no, item.checkpoint, item.expectedResult, item.selfCheck1, item.selfCheck2, item.tr1, item.tr2, item.remarks]
    const centers = [true, false, false, true, true, true, true, false]
    const bgs = [rowBg, rowBg, rowBg, item.selfCheck1 === 'OK' ? C.done : item.selfCheck1 === 'NG' ? 'FFFEE2E2' : rowBg,
      item.selfCheck2 === 'OK' ? C.done : item.selfCheck2 === 'NG' ? 'FFFEE2E2' : rowBg,
      item.tr1 === 'OK' ? C.done : item.tr1 === 'NG' ? 'FFFEE2E2' : rowBg,
      item.tr2 === 'OK' ? C.done : item.tr2 === 'NG' ? 'FFFEE2E2' : rowBg, rowBg]
    vals.forEach((v, i) => {
      const c2 = ws.getCell(r, i + 1); c2.value = v ?? ''
      sc(c2, { center: centers[i], bg: bgs[i] ?? undefined, border: true, bold: i === 1, wrap: i === 2 })
    })
    r++
  })

  r++
  // Version control
  ws.getRow(r).height = 14
  const verTitleCell = ws.getCell(r, 1); verTitleCell.value = 'VERSION CONTROL'
  sc(verTitleCell, { bold: true, center: true, bg: C.verGreen, border: true })
  ws.mergeCells(r, 1, r, 8); r++

  ws.getRow(r).height = 13
  ;['Version #', 'Reason for Revision', '', 'Date', 'Updated By', '', '', ''].forEach((h, i) => {
    if (!h) return
    const c2 = ws.getCell(r, i + 1); c2.value = h
    sc(c2, { bold: true, center: true, bg: 'FFF2F2F2', border: true })
  })
  ;[3, 6, 7, 8].forEach(c2 => ws.getCell(r, c2).border = BORDER)
  r++

  sc2.versionHistory.forEach(v => {
    ws.getRow(r).height = 13
    const vals = [v.version, v.reason, '', v.date, v.updatedBy, '', '', '']
    vals.forEach((val, i) => {
      const c2 = ws.getCell(r, i + 1); c2.value = val
      sc(c2, { center: i === 0 || i === 3 || i === 4, border: true })
    })
    r++
  })
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportToExcel(plan: ActivityPlan, sc3: SelfCheckTR): Promise<void> {
  const wb = new Workbook()
  wb.creator = 'Activity Planning Tool'
  wb.created = new Date()

  const planSheetName = plan.type === 'development' ? 'Activity Plan(Development)' : 'Activity Plan(Support)'
  const planWS = wb.addWorksheet(planSheetName, { views: [], properties: { defaultRowHeight: 13 } })
  await buildActivityPlanSheet(planWS, plan, wb)

  const scWS = wb.addWorksheet('Self Check TR', { properties: { defaultRowHeight: 13 } })
  await buildSelfCheckSheet(scWS, sc3)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeStr = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim()
  const itPart = plan.itNumber?.trim() ? `${safeStr(plan.itNumber)}-` : ''
  const titlePart = safeStr(plan.title || 'ActivityPlan')
  link.download = `${itPart}Activity Plan-${titlePart}-v${plan.documentVersion}.xlsx`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}
