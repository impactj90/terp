# ZMI Time Clone - PRD Part 5: UI/UX Requirements

## Design Principles

1. **Responsive** - Works on desktop, tablet, mobile
2. **Role-based** - Show only what user can access
3. **Efficient** - Minimize clicks for common tasks
4. **Clear** - Obvious data display and actions
5. **Accessible** - WCAG 2.1 AA compliance

---

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│  LOGO    [Dashboard] [Time] [Employees] [Admin]    [User ▼] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │              │  │                                      │ │
│  │   Sidebar    │  │           Main Content               │ │
│  │   (context   │  │                                      │ │
│  │   dependent) │  │                                      │ │
│  │              │  │                                      │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Main Navigation Items

| Menu | Submenu | Description |
|------|---------|-------------|
| **Dashboard** | - | Overview, quick stats, alerts |
| **Time** | My Time | Employee's own time view |
| | Bookings | All bookings (admin) |
| | Corrections | Error correction |
| | Calendar | Yearly overview |
| **Employees** | List | Employee directory |
| | Teams | Team management |
| | Departments | Department management |
| **Reports** | Monthly | Monthly time reports |
| | Absence | Absence statistics |
| | Custom | Query builder |
| **Admin** | Users | User management |
| | Time Plans | Day/week plans |
| | Absence Types | Configure absences |
| | Settings | System settings |
| | Audit Log | Change history |

---

## Screen Specifications

### S01: Login Screen

```
┌─────────────────────────────────────────┐
│                                         │
│              [LOGO]                     │
│                                         │
│         ┌─────────────────┐             │
│         │ Tenant Code     │  (if multi) │
│         └─────────────────┘             │
│         ┌─────────────────┐             │
│         │ Username        │             │
│         └─────────────────┘             │
│         ┌─────────────────┐             │
│         │ Password        │             │
│         └─────────────────┘             │
│                                         │
│         [      LOGIN      ]             │
│                                         │
│         Forgot password?                │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
- Remember username option
- SSO button (if configured)
- Error messages inline
- Password visibility toggle

---

### S02: Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                        [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Today       │ │ This Month  │ │ Vacation    │           │
│  │ 07:45 hrs   │ │ 142:30 hrs  │ │ 22.5 days   │           │
│  │ +00:15      │ │ +08:30      │ │ remaining   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Corrections Needed                            [View] │   │
│  │ • 3 errors requiring attention                       │   │
│  │ • 5 warnings                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Recent Activity                                      │   │
│  │ • 08:03 - Clock in                                  │   │
│  │ • Yesterday 17:12 - Clock out                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Team Status (if supervisor)                         │   │
│  │ Present: 12  |  Absent: 3  |  On vacation: 2       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Role-specific content:**
- Employee: Own stats, quick clock in/out
- Supervisor: Team overview, pending approvals
- Admin: System stats, error counts

---

### S03: My Time (Employee View)

```
┌─────────────────────────────────────────────────────────────┐
│ My Time                      [<] January 2024 [>]    [Today]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Mon 15 │ Tue 16 │ Wed 17 │ Thu 18 │ Fri 19 │ Sat │ Sun │ │
│  │  8:30  │  8:15  │   UL   │  8:45  │  7:30  │  -  │  -  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Selected: Monday, January 15, 2024                        │
│  Day Plan: Flextime 8h                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Bookings                                            │   │
│  │ ┌────────┬──────────┬──────────┬──────────┐        │   │
│  │ │ Type   │ Original │ Edited   │ Calculated│        │   │
│  │ ├────────┼──────────┼──────────┼──────────┤        │   │
│  │ │ Come   │ 08:03    │ 08:03    │ 08:15    │        │   │
│  │ │ Go     │ 17:12    │ 17:12    │ 17:00    │        │   │
│  │ └────────┴──────────┴──────────┴──────────┘        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Daily Summary                                       │   │
│  │ Gross: 9:09  Net: 8:45  Target: 8:00  +0:45        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Monthly Summary                                     │   │
│  │ Worked: 142:30  Target: 160:00  Balance: -17:30    │   │
│  │ Flextime: +08:45                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Interactions:**
- Click date to view details
- Week navigation
- Color-coded days (normal, absence, holiday, error)
- Quick absence request button

---

### S04: Booking Overview (Admin)

```
┌─────────────────────────────────────────────────────────────┐
│ Booking Overview                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Employee: [Dropdown ▼]  Date: [Calendar] [<] [>]          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ John Doe (#1234)                    Mon, Jan 15     │   │
│  │ Department: IT                                       │   │
│  │ Day Plan: Flextime 8h [Change] [Modify]             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Bookings                               [+ Add]      │   │
│  │ ┌────┬────────┬──────────┬────────┬────────┬─────┐ │   │
│  │ │    │ Type   │ Original │ Edited │ Calc.  │     │ │   │
│  │ ├────┼────────┼──────────┼────────┼────────┼─────┤ │   │
│  │ │ 1  │ Come   │ 08:03    │ 08:03  │ 08:15  │ [✎] │ │   │
│  │ │ 2  │ Go     │ 17:12    │ 17:12  │ 17:00  │ [✎] │ │   │
│  │ └────┴────────┴──────────┴────────┴────────┴─────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Summary                                              │   │
│  │ Gross: 9:09  Net: 8:45  Target: 8:00                │   │
│  │ Overtime: +0:45  Break: 0:30                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Calculate Day] [Absences ▼] [History]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Actions:**
- Edit booking times
- Add new booking
- Delete booking
- Change day plan
- Modify day plan for this day only
- Record absence
- Calculate day
- View change history

---

### S05: Correction Assistant

```
┌─────────────────────────────────────────────────────────────┐
│ Corrections                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  From: [Calendar]  To: [Calendar]  Department: [All ▼]     │
│  [Errors ●] [Warnings ○] [Resolved ○]           [Refresh]  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Errors: 15 | Warnings: 8                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Employee       │ Date     │ Error          │ Action   │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ John Doe       │ Jan 15   │ Missing Go     │ [Fix →]  │ │
│  │ Jane Smith     │ Jan 15   │ Missing Come   │ [Fix →]  │ │
│  │ Bob Johnson    │ Jan 14   │ Unpaired       │ [Fix →]  │ │
│  │ ...            │          │                │          │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  [< 1 2 3 ... 5 >]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Click row to open booking detail
- Filter by error type
- Sort by date, employee, error type
- Bulk resolve (dismiss warnings)

---

### S06: Employee List

```
┌─────────────────────────────────────────────────────────────┐
│ Employees                                      [+ Add New]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Search: [________________]  Department: [All ▼]           │
│  Status: [● Active ○ Inactive ○ All]                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ # │ Name          │ Department │ Entry    │ Status   │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ 1001 │ Doe, John    │ IT        │ 2020-01 │ Active   │ │
│  │ 1002 │ Smith, Jane  │ HR        │ 2019-05 │ Active   │ │
│  │ 1003 │ Johnson, Bob │ Sales     │ 2021-03 │ Active   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Showing 1-20 of 150 employees    [< 1 2 3 ... 8 >]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Click row to open employee detail
- Sortable columns
- Quick search
- Export to Excel
- Tree view toggle

---

### S07: Employee Detail

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to List          John Doe (#1001)         [Edit]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [General] [Tariff] [Absences] [Time] [Files] [History]    │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│  General Tab:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Photo]   John Doe                                 │   │
│  │            Personnel #: 1001                        │   │
│  │            PIN: 4567                                │   │
│  │            Department: IT                           │   │
│  │            Entry: January 15, 2020                  │   │
│  │            Status: Active                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Personal Information                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Birth Date: May 20, 1990                           │   │
│  │  Gender: Male                                       │   │
│  │  Nationality: German                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Contact                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Email: john.doe@company.com                        │   │
│  │  Phone: +49 123 456789                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Tabs:**
- **General:** Basic info, address, contacts
- **Tariff:** Work rules, time plans, vacation settings
- **Absences:** Vacation/sick/special day history
- **Time:** Monthly/yearly time overview
- **Files:** Document attachments
- **History:** Change audit trail

---

### S08: Day Plan Editor

```
┌─────────────────────────────────────────────────────────────┐
│ Day Plan: Flextime 8h (010)                          [Save]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [General] [Breaks] [Rounding] [Bonuses] [Shifts] [Other]  │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│  General Tab:                                               │
│                                                             │
│  Code: [010____]      Name: [Flextime 8h____________]      │
│                                                             │
│  Type: (●) Flextime  ( ) Fixed Time                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Core Times                                          │   │
│  │ Come from: [07:00]  to: [09:00]                    │   │
│  │ Go from:   [15:00]  to: [19:00]                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Target Hours                                        │   │
│  │ Regular hours 1: [08:00] [✓] Active                │   │
│  │ Regular hours 2: [______] [ ] Active                │   │
│  │ [ ] Use hours from employee master                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Color: [■] #4CAF50                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### S09: Absence Calendar

```
┌─────────────────────────────────────────────────────────────┐
│ Absence Calendar 2024                           [+ Request] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Employee: [John Doe ▼]                                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     January 2024                                    │   │
│  │ Mo Tu We Th Fr Sa Su                                │   │
│  │  1  2  3  4  5  6  7                               │   │
│  │  8  9 10 11 12 13 14                               │   │
│  │ 15 16 17[18 19]20 21   ← Vacation                  │   │
│  │ 22 23 24 25 26 27 28                               │   │
│  │ 29 30 31                                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Legend:                                                    │
│  [■] Vacation  [■] Sick  [■] Holiday  [■] Special         │
│                                                             │
│  Selected: Jan 18-19 (Vacation)                            │
│  [Edit] [Delete]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### S10: Reports

```
┌─────────────────────────────────────────────────────────────┐
│ Reports                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Report Type: [Monthly Report ▼]                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Parameters                                          │   │
│  │ Month: [January ▼] [2024 ▼]                        │   │
│  │ Department: [All ▼]                                 │   │
│  │ Employees: [All ▼] or [Select specific...]         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Output: (●) Preview  ( ) PDF  ( ) Excel                   │
│                                                             │
│  [Generate Report]                                         │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│                                                             │
│  [Report Preview Area]                                     │
│                                                             │
│                                                             │
│                                           [Download] [Print]│
└─────────────────────────────────────────────────────────────┘
```

---

## Mobile Considerations

### Mobile Navigation
- Hamburger menu for main nav
- Bottom tab bar for frequent actions
- Swipe gestures for date navigation

### Mobile-Optimized Screens
1. **Clock In/Out** - Big buttons, one-tap action
2. **My Time** - Simplified daily view
3. **Request Absence** - Quick form

### Mobile Restrictions
- Complex admin screens desktop-only
- Reports desktop-only (can request email delivery)
- Day plan editor desktop-only

---

## Accessibility Requirements

- Keyboard navigation for all actions
- Screen reader labels
- Minimum contrast ratios
- Focus indicators
- Error announcements
- Skip links
- Responsive text sizing

---

## Color Scheme Suggestions

| Use | Color | Hex |
|-----|-------|-----|
| Primary | Blue | #1976D2 |
| Success | Green | #4CAF50 |
| Warning | Orange | #FF9800 |
| Error | Red | #F44336 |
| Vacation | Light Blue | #03A9F4 |
| Sick | Pink | #E91E63 |
| Holiday | Purple | #9C27B0 |
| Special | Teal | #009688 |
