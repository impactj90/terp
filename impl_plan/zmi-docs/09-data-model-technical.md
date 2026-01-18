# ZMI Time - Part 9: Data Model and Technical Summary

## Core Entities

### 1. Mandant (Tenant/Company)
```
Mandant {
  id: number
  name: string
  address: Address
  holidays: Holiday[]
  exportPath: string
  vacationCalculationType: 'calendar_year' | 'entry_date'
  notes: string
}

Holiday {
  id: number
  mandantId: number
  date: date
  name: string
  category: 1 | 2 | 3  // 1=full, 2=half, 3=custom
}
```

### 2. User (System User)
```
User {
  id: number
  name: string  // login name
  password: string (hashed)
  userGroupId: number
  windowsUser: string?  // for SSO
  employeeId: number?  // linked employee
  dataAccess: {
    type: 'all' | 'mandants' | 'departments' | 'employees'
    allowedIds: number[]
  }
}

UserGroup {
  id: number
  name: string
  permissions: Permission[]
}

Permission {
  module: string
  read: boolean
  write: boolean
  delete: boolean
}
```

### 3. Employee (Mitarbeiter)
```
Employee {
  id: number
  personnelNumber: string
  pin: string
  firstName: string
  lastName: string
  entryDate: date
  exitDate: date?
  exitReason: string?
  
  // Address
  address: Address
  
  // Additional
  photo: blob?
  birthDate: date?
  gender: string?
  nationality: string?
  religion: string?
  maritalStatus: string?
  birthPlace: string?
  birthCountry: string?
  roomNumber: string?
  
  // Organization
  mandantId: number
  departmentId: number?
  costCenterId: number?
  treeStructure: string?
  
  // Groups
  employeeGroupId: number?
  workflowGroupId: number?
  payrollExportId: number?
  activityGroupId: number?
  defaultOrderId: number?
  defaultActivityId: number?
  
  // Flags
  isActive: boolean
  hasDisability: boolean
  
  // Control
  requiresLicenseCheck: boolean
  licenseCheckRoleId: number?
  requiresCovidCheck: boolean
  covidCheckRoleId: number?
}
```

### 4. Tariff
```
Tariff {
  id: number
  employeeId: number
  name: string
  validFrom: date
  validTo: date?
  
  // Vacation
  annualVacation: number  // days
  workDaysPerWeek: number
  employmentTypeId: number
  
  // Hours
  dailyTargetHours: duration?
  weeklyTargetHours: duration?
  monthlyTargetHours: duration?
  annualTargetHours: duration?
  
  // Type
  employmentType: 'fulltime' | 'parttime'
  parttimePercentage: number?
  
  // Evaluation
  monthlyEvaluationId: number?
  
  // Macros
  weeklyMacroId: number?
  weeklyMacroDay: number?  // 0=Sunday, 6=Saturday
  monthlyMacroId: number?
  monthlyMacroDay: number?  // 1-31
  
  // Time plans
  timePlanRhythm: 'weekly' | 'x_days'
  xDays: number?  // if rhythm is x_days
  weekPlans: WeekPlanAssignment[]
}
```

### 5. Time Plans

```
DayPlan {
  id: number
  code: string  // 3-digit
  name: string
  mandantId: number?  // null = all mandants
  type: 'fixed' | 'flextime'
  color: string?
  
  // Core times
  comeFrom: time
  comeTo: time?  // flextime only
  goFrom: time
  goTo: time?  // flextime only
  
  // Target hours
  regularHours1: duration
  regularHours1Active: boolean
  regularHours2: duration?
  regularHours2Active: boolean
  useHoursFromEmployee: boolean
  
  // Breaks
  breaks: Break[]
  
  // Tolerance
  tolerance: {
    comePositive: minutes
    comeNegative: minutes
    goPositive: minutes
    goNegative: minutes
    variableWorkTime: boolean
  }
  
  // Rounding
  rounding: {
    come: RoundingRule
    go: RoundingRule
    roundAllBookings: boolean
  }
  
  // Special
  holidayCredits: {
    category1: duration
    category2: duration
    category3: duration
  }
  vacationDeduction: number  // usually 1
  noBookingBehavior: 'none' | 'deduct' | 'vocational' | 'credit' | 'credit_with_order'
  dayChangeBehavior: 'none' | 'evaluate_come' | 'evaluate_go' | 'auto_complete'
  
  // Bonuses
  bonuses: Bonus[]
  
  // Shift detection
  shiftDetection: {
    enabled: boolean
    comeFrom: time?
    comeTo: time?
    goFrom: time?
    goTo: time?
    alternativePlans: string[]  // up to 6 codes
  }
  
  // Misc
  dayMacroId: number?
  dayNetAccountId: number?
  capAccountId: number?
  alternativePlanCode: string?
  maxNetWorkTime: duration?
}

Break {
  type: 'fixed1' | 'fixed2' | 'fixed3' | 'variable' | 'minimum1' | 'minimum2'
  from: time?
  duration: duration
  afterHours: duration?  // for minimum breaks
  minutesDifference: boolean  // only deduct actual overage
}

RoundingRule {
  type: 'round_up' | 'round_down' | 'mathematical' | 'add' | 'subtract'
  interval: minutes
}

Bonus {
  accountId: number
  fromTime: time
  toTime: time  // must be 00:00 for overnight
  holidayCategories: number[]
  excludeHolidays: boolean
}

WeekPlan {
  id: number
  code: string
  name: string
  mandantId: number?
  monday: string  // day plan code
  tuesday: string
  wednesday: string
  thursday: string
  friday: string
  saturday: string
  sunday: string
}

MonthlyEvaluation {
  id: number
  name: string
  maxMonthlyFlextime: duration?
  upperAnnualLimit: duration?
  lowerAnnualLimit: duration?
  flextimeThreshold: duration?
  creditType: 'none' | 'complete' | 'after_threshold' | 'no_transfer'
}
```

### 6. Bookings

```
Booking {
  id: number
  employeeId: number
  date: date
  
  // Type
  bookingTypeCode: string  // A1, A2, PA, PE, DA, DE, etc.
  
  // Times
  originalTime: time  // from terminal, immutable
  editedTime: time    // can be modified
  calculatedTime: time  // after rules applied
  
  // Pairing
  pairId: number?  // links come/go pairs
  pairPosition: 1 | 2  // first or second in pair
  
  // Source
  terminalId: number?
  
  // Audit
  createdBy: string
  createdAt: datetime
  modifiedBy: string?
  modifiedAt: datetime?
}

BookingType {
  code: string  // A1, A2, PA, PE, DA, DE, custom...
  name: string
  behavior: 'come_go' | 'break' | 'business_trip' | 'custom'
  accountId: number?  // for tracking
}
```

### 7. Absence Days

```
AbsenceDay {
  id: number
  employeeId: number
  date: date
  typeCode: string  // UL, KR, SB, etc.
  remark: string?
}

AbsenceType {
  code: string  // must start with U, K, or S
  name: string
  calculationId: number
  portion: 0 | 1 | 2  // 0=none, 1=full, 2=half
  holidayCode: string?  // alternative code on holidays
  priority: number
  color: string?
  functionKey: number?  // F1-F12
  accountId: number?
}
```

### 8. Accounts

```
Account {
  id: number
  number: string
  name: string
  payrollType: string?  // Lohnart
  format: 'decimal' | 'hours_minutes'
  scope: 'day' | 'month'
  bonusFactor: number?
  carryToNextYear: boolean
  includeInExport: boolean
}

AccountValue {
  accountId: number
  employeeId: number
  date: date
  value: number
}
```

### 9. Calculated Values

```
DailyValue {
  employeeId: number
  date: date
  dayPlanCode: string
  isManuallyChanged: boolean
  
  grossTime: duration
  netTime: duration
  overtime: duration
  breakTime: duration
  
  absenceTypeCode: string?
  holidayCategory: number?
  
  hasError: boolean
  errorCodes: string[]
  
  // Account values for this day
  accountValues: Map<accountId, value>
}

MonthlyValue {
  employeeId: number
  year: number
  month: number
  
  totalGrossTime: duration
  totalNetTime: duration
  totalOvertime: duration
  totalBreakTime: duration
  
  targetTime: duration
  difference: duration
  
  flextimeBalance: duration
  flextimeCarryover: duration
  
  vacationTaken: number
  vacationRemaining: number
  sickDays: number
  
  // Account totals for this month
  accountTotals: Map<accountId, value>
  
  isClosed: boolean
  closedAt: datetime?
  closedBy: string?
}
```

---

## Key Business Rules

### Time Calculation Flow
```
1. Terminal booking received
2. Paired with matching booking (come/go)
3. Day plan retrieved for employee/date
4. Tolerance rules applied
5. Rounding rules applied
6. Break deductions applied
7. Daily totals calculated
8. Account values updated
9. Day macro executed (if configured)
10. Week macro executed (if Sunday or configured day)
11. Monthly evaluation applied (if month end)
```

### Vacation Calculation
```
At year start:
1. Get annual entitlement
2. Add special calculations (age, tenure, disability)
3. Apply prorated for entry/exit
4. Add carryover from previous year
5. Apply capping rules
6. Set as available vacation
```

### Shift Auto-Detection
```
1. Employee clocks in
2. System checks come time against configured windows
3. If no match, check alternative day plans
4. If found, swap to matching day plan
5. If not found, generate error
```

### Month Closing
```
1. All days must be error-free
2. All calculations complete
3. Lock month from editing
4. Carry values to next month
```

---

## Core Modules Summary

| Module | Purpose |
|--------|---------|
| **Verwaltung** | System administration |
| **Vorgaben** | Master data definitions |
| **Daten** | Operational data management |
| **Bericht** | Reporting |
| **Sonstiges** | Export/utilities |

---

## Integration Points

### Terminal Communication
- Retrieve bookings
- Send master data
- Sync time
- Send access profiles

### Payroll Export
- Configurable field mapping
- Multiple format support
- Scheduled or manual export

### WebClient
- Employee self-service
- Workflow requests
- Mobile access

### Mobile App
- Booking via smartphone
- Push notifications
- Document scanning (licenses, certificates)

---

## Access Control Model

```
User → UserGroup → Permissions

Permissions scope:
- Module level (show/hide)
- Tab level (show/hide)
- Field level (read/write)
- Action level (specific functions)
- Data level (which employees visible)
```

---

## Localization Notes

**Language:** German (primary)

**Key Terms:**
- Kommen = Clock in / Arrive
- Gehen = Clock out / Leave
- Buchung = Booking / Punch
- Fehltag = Absence day
- Urlaub = Vacation
- Krankheit = Illness
- Sollzeit = Target time
- Istzeit = Actual time
- Gleitzeit = Flextime
- Überstunden = Overtime
- Zuschlag = Bonus/Premium
- Kappung = Capping
- Mandant = Tenant/Company
