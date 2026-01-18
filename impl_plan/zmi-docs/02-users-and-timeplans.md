# ZMI Time - Part 2: User Management and Time Plans

## 3. Program

### 3.1 Operating Instructions

| Button | Function |
|--------|----------|
| **New** | Create new empty record |
| **Undo** | Undo last entry only |
| **Save** | Save entered values |
| **Delete** | Mark record as invisible (remains in database, can be restored) |
| **Search** | Open search function with multiple filters |
| **Close** | Close current module |
| **First** | Jump to first record |
| **Last** | Jump to last record |
| **Previous** | Jump to previous record |
| **Next** | Jump to next record |
| **Reset** | Reset all grid changes to original settings |

### Password Change
Users can change their password via "Passwort ändern"

### User Switch
Log out and log in with different user without restarting ZMI Time

---

## 3.2 Mandant Master Data (Mandantenstamm)

### Company Data
- Company name (appears in employee records)
- Address
- Export path for payroll data

### Holidays Tab
- Displays holidays for last two years
- Add/remove holidays
- Calculate holidays by year and federal state (Bundesland)

### Holiday Categories
| Category | Typical Use |
|----------|-------------|
| **Category 1** | Full holiday (full working time credited) |
| **Category 2** | Half holiday (e.g., Christmas Eve, New Year's Eve) |
| **Category 3** | Special cases |

> **Important:** After changing holidays in the past, affected months must be recalculated!

### Notes Tab
Store mandant-specific information

### Vacation Calculation Tab
- Option: Calculate based on calendar year or entry date

---

## 3.3 User Management (Benutzerverwaltung)

### 3.3.1 Default User
- Username: zmi
- Password: zmi (case-sensitive)

### 3.3.2 Creating New Users

**Benefits of individual users:**
- Personal grid settings per user
- Change logging with username
- Detailed access rights via user groups

**User Fields:**
- Name (login name)
- User group assignment
- Windows user (for Single Sign-On)
- Associated employee from personnel master

**ZMI Time Tab - Data Access:**
- All employees
- Specific mandants only
- Specific departments only
- Specific employees only

### 3.3.3 User Groups

Define access rights for groups, then assign users to groups.

#### 3.3.3.1 General Tab
- Lock/unlock specific programs for the group

#### 3.3.3.2 ZMI Time Modules Tab
Per module permissions:
- Read
- Write
- Delete
- If no checkbox = module hidden

#### 3.3.3.3 Personnel Tab
**Tabs:** Access rights per personnel master tab (read/write/delete)

**Data:** Permissions for:
- Main mask fields
- Additional tab
- Planning tab
- History
- Access authorizations
- Card printing
- Cost types

**Monthly Values:** Permissions for monthly overview fields

#### 3.3.3.4 Order Tab (Auftrag)
- Tab access rights
- Data permissions (mandant change, hourly rates, etc.)
- Restrict to order leader/sales assignments

#### 3.3.3.5 Booking Overview Tab
- Module access
- Tab access
- Function permissions (change day plan, calculate day, etc.)

#### 3.3.3.6 System Settings Tab
- Access to individual system settings tabs

#### 3.3.3.7 Report Tab
- Access to different report types

#### 3.3.3.8 Evaluations Tab
- Permissions for evaluation module tabs

#### 3.3.3.9 Vacation Planner Tab
- Permissions for ZMI Urlaub

#### 3.3.3.10 Vehicle Data Tab
- Permissions for vehicles and routes modules

#### 3.3.3.11 Interfaces and Macros Tab
- Permissions for data exchange, export, and macro management

---

## 3.4 Time Plans (Zeitpläne)

Time plans define working time specifications for employees.

### Types of Time Plans
1. **Fixed Working Time (Festarbeitszeit - FAZ)** - Fixed start and end times
2. **Flextime (Gleitzeit - GLZ)** - Flexible time windows

### Structure
- **Day Plans (Tagespläne)** - Define individual day rules
- **Week Plans (Wochenpläne)** - Combine day plans for a week
- Week plans are assigned to employees

### 3.4.1 Naming Convention (Kennung und Bezeichnung)

**Reserved prefixes:** U, K, S (for absence types)

**Recommended approach:** 3-digit numbers in steps of 5 or 10

**Examples - Day Plans without Shifts:**
| Code | Description |
|------|-------------|
| 010 | Flextime Mon-Thu 8 hrs |
| 020 | Flextime Fri 5 hrs |
| 030 | Flextime |
| 050 | Fixed work Mon-Thu |
| 055 | Fixed work Fri |
| 060 | Temp worker |

**Examples - Day Plans with Shifts:**
| Code | Description |
|------|-------------|
| 100 | Early shift 1 |
| 110 | Early shift 2 |
| 200 | Late shift 1 |
| 210 | Late shift 2 |
| 300 | Night shift 1 |

**Weekend Plans:**
| Code | Description |
|------|-------------|
| 090 | Weekend |
| 091 | Saturday |
| 092 | Sunday |

### 3.4.2 System Architecture

```
Personnel Data ←→ Time Plans
        ↓
Personal Calendar (per employee, per day)
```

Individual day modifications possible without creating new day plans.

### 3.4.3 Day Plan (Tagesplan)

Default day plans available after installation. Copy and modify for custom needs.

### 3.4.4 Creating New Day Plan

1. Select existing day plan
2. Click "Copy"
3. Assign new number and designation
4. Optionally assign to specific mandant

#### 3.4.4.1 Fixed Working Time (Festarbeitszeit)

- **Kommen von** (Come from): Fixed start time
- **Gehen von** (Go from): Fixed end time
- Time plan type: FAZ

**Regular Working Time 1:**
- Daily hours to be worked
- "Active" checkbox = attendance required

**Regular Working Time 2:**
- Alternative hours for absence days
- Can use weekly average if daily hours vary

**Get from Personnel Master:**
- Use hours from employee record instead of plan
- Useful when employees have same schedule but different hours

#### 3.4.4.2 Flextime (Gleitzeit)

Time windows for arrival and departure:
- **Kommen von/bis** (Come from/to): e.g., 07:00-09:00
- **Gehen von/bis** (Go from/to): e.g., 15:00-19:00

**Core Time:** Between the windows = mandatory presence

**Boundary Enforcement:**
- Booking before "Kommen von" = core time violation
- Time only counted from boundary (e.g., 06:00)

#### 3.4.4.3 Breaks (Pausen)

| Type | Description |
|------|-------------|
| **Pause 1 (fest)** | Fixed break, always deducted |
| **Pause 2 (fest)** | Second fixed break (e.g., lunch) |
| **Pause 3 (fest)** | Third fixed break |
| **Pause 4 (variabel)** | Deducted only if no break booked |
| **Mindestpause 1 nach** | Minimum break after X hours presence |
| **Mindestpause 2 nach** | Second minimum break rule |

**Minutes Difference option:** Only deduct actual time exceeding threshold, not full break amount.

#### 3.4.4.4 Tolerance

For flextime: Extend booking windows

For fixed time:
- **Tolerance Kommen +**: Round early arrivals in X-minute steps
- **Tolerance Kommen -**: Grace period for late arrival
- **Tolerance Gehen -**: Grace period for early departure
- **Tolerance Gehen +**: Round late departures in X-minute steps

**Variable Working Time:** Must be set for "Tolerance Kommen -" to apply

#### 3.4.4.5 Rounding (Abgleich)

| Mode | Description |
|------|-------------|
| **Round Up (Aufrunden)** | Round to next interval (for arrivals) |
| **Round Down (Abrunden)** | Round to previous interval (for departures) |
| **Mathematical (Mathematisch)** | Standard rounding rules |
| **Add Value** | Add fixed time to booking |
| **Subtract Value** | Subtract fixed time from booking |

**All Bookings Round:** If checked, round all in/out bookings. Otherwise only first in/last out.

#### 3.4.4.6 Special Functions (Sonderfunktionen)

**Holiday Time Credit:**
- Category 1: Full day credit (typically regular hours)
- Category 2: Half day credit
- Category 3: Custom

**Vacation Evaluation:**
- Days deducted per vacation day (usually 1)
- Can be hours if vacation tracked in hours

**Days Without Bookings:**
| Option | Effect |
|--------|--------|
| No evaluation | Day marked as error in correction assistant |
| Deduct target hours | Automatically deduct planned hours |
| Vocational school day | Auto-insert vocational school absence |
| Take target hours | Auto-credit planned hours as attendance |
| Target hours with main order | Book to main order (ZMI Auftrag) |

**Day Change (Tageswechsel):**
| Option | Use Case |
|--------|----------|
| No day change | Normal day work |
| Evaluate at arrival | Night shift, credit to arrival day |
| Evaluate at departure | Night shift, credit to departure day |
| Auto-complete | Insert 00:00 bookings automatically |

#### 3.4.4.7 Bonuses (Zuschläge)

Define accounts filled at specific times:
- Holiday bonus (all day for category 1/2)
- Night bonus (e.g., 22:00-06:00)

> **Note:** Enter times as 22:00-00:00 and 00:00-06:00, not 22:00-06:00

#### 3.4.4.8 Shift (Schicht)

**Automatic Shift Recognition:**
- Define time windows for arrival/departure
- System checks bookings against windows
- Switches to alternative day plan if no match
- Up to 6 alternative day plans

#### 3.4.4.9 Miscellaneous (Sonstiges)

- **Day Macro:** Execute after day calculation
- **Day Net Account:** Tracks normal daily work time
- **Cap Account:** Tracks time cut before evaluation frame
- **Alternative Day Plan:** Quick-switch with F2 key
- **Max Net Working Time:** Cap daily total (e.g., 10 hours)

#### 3.4.4.10 Booking with Reason (Buchen mit Grund)

Allow special bookings at terminal (e.g., "Post run"):
1. Create booking type (e.g., "PG" for Postgang)
2. Set behavior as Kommen/Gehen
3. Configure auto-inserted booking time
4. Add to booking type group
5. Select in day plan

#### 3.4.4.11 Planning
Used for ZMI PEP / Plantafel (shift planning module)

#### 3.4.4.12 Info
Free-text information about the day plan

#### 3.4.4.13 Group
Assign day plans to groups for WebClient and other modules

### 3.4.5 Week Plans (Wochenpläne)

Combine day plans for Monday through Sunday:
1. Click "New"
2. Name the week plan
3. Select day plan for each weekday
4. Optionally restrict to specific mandant

> **Important:** Every day must have a day plan assigned, even if employee is off that day.

### 3.4.6 Week Plan Groups
Similar to day plan groups, for WebClient and other modules

---

## 3.5 Monthly Evaluation (Monatsbewertung)

Define month-end processing rules:

| Setting | Description |
|---------|-------------|
| **Max monthly flextime** | Maximum hours transferred to flextime account |
| **Upper limit annual account** | Cap on annual flextime balance |
| **Lower limit annual account** | Minimum annual flextime balance |
| **Flextime threshold** | Minimum overtime before credited |

**Credit Types:**
- No evaluation: 1:1 transfer
- Complete transfer: With caps applied
- Transfer after threshold: Only credit if above threshold
- No transfer: Reset to 0 each month

---

## 3.6 Time Plan Changes

When day plan definitions change (e.g., hours increased):

1. Modify the day plan
2. Click "Eintragen" (Enter)
3. Select date range
4. Choose whether to overwrite manual changes

> **Recommendation:** For past changes, answer "No" to preserve manual corrections.

---

## 3.7 Manual Changes in Day Plans

In booking overview:
1. Click "Ändern" (Change)
2. Modify day plan settings
3. Save

Changed days shown in blue italic text.

---

## 3.8 Assign Time Plans in Personnel Master

Time plans are assigned in the employee's Tarif (tariff) tab.
