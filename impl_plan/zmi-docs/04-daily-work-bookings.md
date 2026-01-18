# ZMI Time - Part 4: Daily Work and Booking Overview

## 5. Daily Work

### 5.1 Correction Assistant (Korrekturassistent)

Central hub for identifying and fixing booking errors.

**Error Types:**
- **Errors (Fehler):** Must be corrected
- **Hints (Hinweise):** Informational, can be deleted

**Default Filter:** Previous month and current month

**Features:**
- Filter by date range
- Filter by department
- Custom sorting via grid
- Double-click error to jump directly to booking

### 5.1.1 Making Corrections

1. Double-click error in Correction Assistant
2. Opens Booking Overview for that employee/date
3. Error day is highlighted
4. Make correction (e.g., add missing Gehen booking)
5. Click **Schließen** to return to Correction Assistant

> **Recommendation:** Process errors promptly for smooth monthly billing.

---

## 5.2 Recording Absence Days

Absence days can be entered in multiple locations:
- Booking Overview
- Personnel Master
- Yearly Overview
- ZMI Vacation Planner

### 5.2.1 In Booking Overview

Click **Fehltage** → **Erfassen**:
1. Select date range
2. Choose absence type (default: UL = Vacation)
3. Add optional remark
4. Save

To delete: **Fehltage** → **Löschen**
- Shows list of all absences for employee
- Select entry to delete

### 5.2.2 In Personnel Master

Separate tabs for:
- **Urlaub** - Vacation entries (U prefix)
- **Krankheit** - Illness entries (K prefix)
- **Sondertage** - Special days (S prefix)

---

## 5.3 Booking Overview (Buchungsübersicht)

Primary interface for viewing and editing daily bookings.

### Header Area
- Employee navigation buttons
- Date navigation
- Current employee details
- Current day plan (code and name)

### Day Plan Buttons
| Button | Function |
|--------|----------|
| **Wechseln** | Switch to different day plan for this day |
| **Ändern** | Modify current day plan settings for this day only |

### Booking Display Structure

Bookings organized in pairs:
- Row 1: Come (Kommen) + Go (Gehen)
- Additional rows: Breaks, business trips, etc.

**Each booking has three values:**

| Column | Description |
|--------|-------------|
| **Original** | Raw value from terminal (read-only) |
| **Editiert** | Editable value (starts as original) |
| **Berechnet** | Calculated value (after rounding, tolerance, etc.) |

### Action Buttons

| Button | Function |
|--------|----------|
| **Neu** | Create new booking entry |
| **Löschen** | Delete selected booking |
| **Sichern** | Save changes |
| **Abbrechen** | Cancel unsaved changes |
| **Tag berechnen** | Recalculate current day |
| **Monat berechnen** | Recalculate entire month |

### Absence Day Functions

**Erfassen (Record):**
- All absence types available (not separated by category)
- Current date pre-filled
- Can select date range

**Löschen (Delete):**
- Shows all absences for employee
- Nearest to current date pre-selected

> **Note:** Final day calculation occurs the following day during automatic overnight processing.

---

## 5.3.1 Log File (Logdatei)

Track who made what changes:

| Tab | Content |
|-----|---------|
| **Buchungslog** | Booking changes |
| **Fehltage Log** | Absence day changes |
| **Zeitplan Log** | Time plan changes |

Shows: User, date/time, old value, new value.

---

## 5.3.2 Evaluation (Auswerten)

Access detailed reports from Booking Overview.

### 5.3.2.1 Daily Values (Tageswerte)

| Column | Description |
|--------|-------------|
| Date | Work date |
| Day Net | Net working time |
| Overtime | Hours over target |
| Break | Total break time |

Click **+** to expand and see individual bookings for that day.

### 5.3.2.2 Monthly Values (Monatswerte)

Summary of all important time data for the month:
- Total hours worked
- Total overtime
- Vacation taken
- Sick days
- Flextime balance
- Etc.

### 5.3.2.3 Daily and Monthly Accounts

Account balances broken down by:
- **Tageskonten** - Daily account values
- **Monatskonten** - Monthly account totals

### 5.3.2.4 Yearly Overview (Jahresübersicht)

Graphical calendar view:
- Color-coded absence days
- Day plan indicators
- Useful for shift visualization

**Record Absences:**
1. Click desired date(s)
2. Right-click → "Fehltag eintragen"
3. Select absence type
4. Confirm

**Delete Absences:**
1. Click the absence day
2. Right-click → "Fehltag löschen"
3. Confirm deletion

---

## Booking Flow Summary

```
Terminal Booking
      ↓
Original Value (stored, never changes)
      ↓
Editiert Value (can be manually adjusted)
      ↓
Day Plan Rules Applied
(rounding, tolerance, breaks, caps)
      ↓
Berechnet Value (used for calculations)
      ↓
Daily Totals
      ↓
Monthly Aggregation
      ↓
Account Updates
```

---

## Common Correction Scenarios

### Missing Booking
1. Open booking overview for the day
2. Click **Neu**
3. Enter time and booking type
4. Save
5. Click **Tag berechnen**

### Wrong Time
1. Find the booking
2. Edit the **Editiert** column
3. Save
4. Click **Tag berechnen**

### Wrong Day Plan
1. Click **Wechseln** next to day plan
2. Select correct plan
3. Click **Tag berechnen**

### One-Time Plan Modification
1. Click **Ändern** next to day plan
2. Modify settings (e.g., remove break)
3. Save changes
4. Day marked as manually changed (blue italic)

### Forgot to Book Break
If employee forgot to book break but took one:
1. Open Booking Overview
2. Create break start booking
3. Create break end booking
4. Or modify day plan to remove automatic break deduction
