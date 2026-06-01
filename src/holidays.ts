export interface Holiday {
  date: string  // YYYY-MM-DD
  name: string
  type: 'regular' | 'special_non_working'
}

export const PH_HOLIDAYS: Holiday[] = [
  // 2025
  { date: '2025-01-01', name: "New Year's Day", type: 'regular' },
  { date: '2025-01-29', name: 'Chinese New Year', type: 'special_non_working' },
  { date: '2025-02-25', name: 'EDSA Anniversary', type: 'special_non_working' },
  { date: '2025-04-09', name: 'Day of Valor', type: 'regular' },
  { date: '2025-04-17', name: 'Maundy Thursday', type: 'regular' },
  { date: '2025-04-18', name: 'Good Friday', type: 'regular' },
  { date: '2025-04-19', name: 'Black Saturday', type: 'special_non_working' },
  { date: '2025-05-01', name: 'Labor Day', type: 'regular' },
  { date: '2025-06-12', name: 'Independence Day', type: 'regular' },
  { date: '2025-08-21', name: 'Ninoy Aquino Day', type: 'special_non_working' },
  { date: '2025-08-25', name: 'National Heroes Day', type: 'regular' },
  { date: '2025-11-01', name: "All Saints' Day", type: 'special_non_working' },
  { date: '2025-11-02', name: "All Souls' Day", type: 'special_non_working' },
  { date: '2025-11-30', name: 'Bonifacio Day', type: 'regular' },
  { date: '2025-12-08', name: 'Immaculate Conception', type: 'special_non_working' },
  { date: '2025-12-24', name: 'Christmas Eve', type: 'special_non_working' },
  { date: '2025-12-25', name: 'Christmas Day', type: 'regular' },
  { date: '2025-12-30', name: 'Rizal Day', type: 'regular' },
  { date: '2025-12-31', name: "New Year's Eve", type: 'special_non_working' },

  // 2026
  { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
  { date: '2026-02-17', name: 'Chinese New Year', type: 'special_non_working' },
  { date: '2026-02-25', name: 'EDSA Anniversary', type: 'special_non_working' },
  { date: '2026-04-02', name: 'Maundy Thursday', type: 'regular' },
  { date: '2026-04-03', name: 'Good Friday', type: 'regular' },
  { date: '2026-04-04', name: 'Black Saturday', type: 'special_non_working' },
  { date: '2026-04-09', name: 'Day of Valor', type: 'regular' },
  { date: '2026-05-01', name: 'Labor Day', type: 'regular' },
  { date: '2026-06-12', name: 'Independence Day', type: 'regular' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'special_non_working' },
  { date: '2026-08-31', name: 'National Heroes Day', type: 'regular' },
  { date: '2026-11-01', name: "All Saints' Day", type: 'special_non_working' },
  { date: '2026-11-02', name: "All Souls' Day", type: 'special_non_working' },
  { date: '2026-11-30', name: 'Bonifacio Day', type: 'regular' },
  { date: '2026-12-08', name: 'Immaculate Conception', type: 'special_non_working' },
  { date: '2026-12-24', name: 'Christmas Eve', type: 'special_non_working' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'regular' },
  { date: '2026-12-30', name: 'Rizal Day', type: 'regular' },
  { date: '2026-12-31', name: "New Year's Eve", type: 'special_non_working' },

  // 2027
  { date: '2027-01-01', name: "New Year's Day", type: 'regular' },
  { date: '2027-02-06', name: 'Chinese New Year', type: 'special_non_working' },
  { date: '2027-02-25', name: 'EDSA Anniversary', type: 'special_non_working' },
  { date: '2027-03-25', name: 'Maundy Thursday', type: 'regular' },
  { date: '2027-03-26', name: 'Good Friday', type: 'regular' },
  { date: '2027-03-27', name: 'Black Saturday', type: 'special_non_working' },
  { date: '2027-04-09', name: 'Day of Valor', type: 'regular' },
  { date: '2027-05-01', name: 'Labor Day', type: 'regular' },
  { date: '2027-06-12', name: 'Independence Day', type: 'regular' },
  { date: '2027-08-21', name: 'Ninoy Aquino Day', type: 'special_non_working' },
  { date: '2027-08-30', name: 'National Heroes Day', type: 'regular' },
  { date: '2027-11-01', name: "All Saints' Day", type: 'special_non_working' },
  { date: '2027-11-02', name: "All Souls' Day", type: 'special_non_working' },
  { date: '2027-11-30', name: 'Bonifacio Day', type: 'regular' },
  { date: '2027-12-08', name: 'Immaculate Conception', type: 'special_non_working' },
  { date: '2027-12-24', name: 'Christmas Eve', type: 'special_non_working' },
  { date: '2027-12-25', name: 'Christmas Day', type: 'regular' },
  { date: '2027-12-30', name: 'Rizal Day', type: 'regular' },
  { date: '2027-12-31', name: "New Year's Eve", type: 'special_non_working' },
]

const _map = new Map<string, Holiday>()
for (const h of PH_HOLIDAYS) _map.set(h.date, h)

export function getHoliday(date: string): Holiday | undefined {
  return _map.get(date)
}

export function isHoliday(date: string): boolean {
  return _map.has(date)
}
