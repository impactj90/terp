# ZMI Time - Part 3: Personnel Master Data (Personalstamm)

## 4. Personnel Master

All employees for time tracking are managed here.

### 4.1 Creating Employees

**Required Fields:**
- Personnel number (Personalnummer)
- PIN (Personal Identification Number) - auto-assigned
- First name (Vorname)
- Last name (Name)
- Entry date (Eintritt)

---

## 4.2 Main Fields

| Field | Description |
|-------|-------------|
| **Personalnummer** | Existing personnel number (usually from payroll) |
| **PIN** | Terminal identification number, auto-incremented |
| **Vorname** | First name |
| **Name** | Last name |
| **Eintritt** | Entry date (required) |
| **Austritt** | Exit date - no bookings possible after this date |
| **Austrittsgrund** | Exit reason (configurable dropdown) |
| **Informationen** | General notes about employee |

---

## 4.3 Address Tab

Standard address fields for employee contact information.

---

## 4.4 Additional Tab (Zusatz)

| Field | Description |
|-------|-------------|
| **Passfoto** | Employee photo (max 189x189px, auto-scaled) |
| **Geboren am** | Birth date (for birthday lists) |
| **Geschlecht** | Gender |
| **Staatsangehörigkeit** | Nationality (configurable) |
| **Konfession** | Religion (configurable) |
| **Familienstand** | Marital status |
| **Geburtsort** | Place of birth |
| **Geburtsland** | Country of birth |
| **RaumNr** | Room number |
| **Mandant** | Assigned mandant (auto-assigned on creation) |
| **Abteilung** | Department (configurable) |
| **Kostenstelle** | Cost center (ZMI Kostenstelle module) |
| **Baumstruktur** | Tree structure for WebClient access rights |

---

## 4.5 Contact Data Tab

Configurable contact information fields. Field types defined in System Settings → Contact Management.

---

## 4.6 Absence Days Tab (Fehltage)

### 4.6.1 Vacation (Urlaub)

Displays vacation entries. Add new or delete existing.

**Vacation types start with "U":**
- UL = Vacation
- UH = Half vacation day
- US = Special leave
- UU = Unpaid leave

**Vacation Correction Tab:**
- Manual vacation value corrections
- Specify date and correction value
- Add remarks

> **Note:** When correcting retroactively, recalculate all months from correction date forward.

### 4.6.2 Illness (Krankheit)

**Illness types start with "K":**
- KR = Sick day
- KO = Sick without pay continuation

### 4.6.3 Special Days (Sondertage)

**Special day types start with "S":**
- SB = Vocational school
- SD = Business trip
- SF = Free shift
- SS = Training

---

## 4.7 Financial Tab (Finanzen)

Bank details, social security number, health insurance, tax information.

---

## 4.8 Info Tab

Overview of current monthly and vacation values:
- Account selection (choose account group to display)
- Status: Last booking, order/activity/cost center info

---

## 4.9 Groups Tab (Gruppen)

| Field | Description |
|-------|-------------|
| **Mitarbeitendengruppe** | Employee group for terminal access control |
| **MA-Gruppe Workflow** | WebClient workflow group |
| **Lohnexport** | Payroll interface definition |
| **Tätigkeitsgruppe** | Activity group for WebClient bookings |
| **Stammauftrag** | Default order (ZMI Auftrag) |
| **Stammtätigkeit** | Default activity (ZMI Auftrag) |
| **Berechne ab** | Calculation start date (system-managed) |

---

## 4.10 Tariff Tab (Tarif)

### 4.10.1 Vacation Values

| Field | Description |
|-------|-------------|
| **Jahresurlaub** | Annual vacation entitlement (e.g., 30 days) |
| **AT pro Woche** | Working days per week (e.g., 5) |
| **Beschäftigungstyp** | Employment type (controls vacation calculation) |
| **Schwerbehinderung** | Disability status (for additional vacation days) |

Click **Berechnen** to calculate prorated vacation for new employees.

> **Important:** Always enter full year vacation entitlement. System calculates prorated amounts and adds full entitlement at year change.

### 4.10.2 Additional Fields

| Field | Description |
|-------|-------------|
| **Tagessollstunden** | Daily target hours (if different from plan) |
| **Wochensollstunden** | Weekly target hours (for macros) |
| **Monatssollstunden** | Monthly target hours (for macros) |
| **Jahressollstunden** | Annual target hours (for macros) |
| **Beschäftigungsart** | Full-time or part-time |
| **Teilzeitgrad** | Part-time percentage (e.g., 50) |

### 4.10.3 Monthly Evaluation

Assign a monthly evaluation rule to the employee.

### 4.10.4 Weekly Macro

| Field | Description |
|-------|-------------|
| **Wochenmakro** | Weekly macro to execute |
| **Ausführungstag** | Execution day (typically Sunday) |

### 4.10.5 Monthly Macro

| Field | Description |
|-------|-------------|
| **Monatsmakro** | Monthly macro to execute |
| **Ausführungstag** | Execution day (typically 31, auto-adjusts) |

### 4.10.6 Time Plan Assignment

**Time Plan Rhythm Options:**
1. **Weekly (wöchentlich)** - Standard weekly rotation
2. **After X Days (nach X-Tagen)** - Custom day cycle

#### Weekly Time Plans

1. Click **+** to add week plan
2. Optionally adjust individual day plans
3. Click **Übernehmen** to apply
4. Click **Speichern** to save tariff
5. Select date range for application
6. Choose whether to overwrite manual changes

#### Rolling Time Plans

For shift rotation (e.g., early/late/night weekly):
1. Add multiple week plans
2. Arrange in order with arrow buttons
3. Click **Eintragen** to apply rotation

#### X-Day Time Plans

For non-weekly cycles:
1. Set number of days in cycle
2. Assign day plan to each day number
3. Click **Eintragen** to apply

---

## 4.11 Tariff Definition

Create reusable tariff templates:
1. Open Tarifdefinition module
2. Click **New**
3. Define all tariff settings
4. Save

Use in Personnel Master → Tariff → "Based on tariff definition"

---

## 4.12 Offset Values

### 4.12.1 Initial Vacation Balance

When starting ZMI Time mid-year:
1. Create tariff with full annual vacation
2. Calculate prorated amount
3. Correct to actual remaining vacation

### 4.12.2 Initial Flextime Balance

1. Go to **Auswerten** (Evaluate)
2. Select **Monatswerte** (Monthly values)
3. Navigate to month BEFORE start month
4. Enter flextime balance in "Gleitzeitübertrag Folgemonat"
5. Calculate the starting month

---

## 4.13 Messages Tab (Meldungen)

Send push notifications to employee phones:
1. Click **New**
2. Enter message text
3. **Save** then **Send**

Status tracked: Sent, Read with timestamp.

> **Note:** Requires license and ZMI Server task "Push Notifications versenden"

---

## 4.14 File Tab (Akte)

Store employee documents and notes:
- Exam results
- Special licenses
- Warnings
- Certificates

**Features:**
- File groups with access rights
- Attachments (copy to data directory recommended)
- Option to store all attachments in database

---

## 4.15 Follow-up (Wiedervorlage)

Set reminder dates for file entries. Configure display window in System Settings → Program Start.

---

## 4.16 Wage Tab (Lohn)

Internal and external billing rates for ZMI Auftrag calculations.

---

## 4.17 Access Tab (Zutritt)

Access control permissions for ZMI Zutrittskontrolle module.

---

## 4.18 Login Tab

Credentials for:
- ZMI WebClient
- ZMI App
- ZMI Dashboard
- ZMI InfoCenter

---

## 4.19 Planning Tab (Planung)

- Profession and qualifications
- Shift planner color
- Qualifications for ZMI Plantafel

---

## 4.20 Expenses Tab (Auslagen)

Record expense receipts:
- Cost type
- Quantity
- Gross total

Cost types configurable.

---

## 4.21 Company Car Tab (Dienstwagen)

Company vehicle assignment and usage permissions.

---

## 4.22 Travel Tab (Reise)

ZMI Auslöse module: View and correct business trips.

---

## 4.23 Driver's License Control (Führerscheinkontrolle)

Ensure drivers have valid licenses:

**Setup:**
1. Check "Führerschein kontrollieren"
2. Assign a control role

**Role Configuration:**
- **General:** Interval, start type (fixed/last check)
- **Employee:** Notification method (email/SMS/push/InfoCenter)
- **Supervisor:** Escalation timing and method
- **Fleet Manager:** Final escalation

**Process:**
1. Employee prompted to show license
2. Scans transponder, then license at terminal
3. Action logged
4. Escalation if not completed

---

## 4.24 ID Cards Tab (Ausweise)

| Field | Description |
|-------|-------------|
| **Kartennummer** | Card number (from sticker or terminal query) |
| **Code** | For ZMI Software Terminal |

Card types configurable in System Settings → Card Management.

---

## 4.25 COVID-19 Certificates (COVID-19-Nachweise)

Manage vaccination/recovery certificates:

**Setup:**
1. Check "Nachweis kontrollieren"
2. Assign a control role

**Role Configuration:**
Similar to driver's license control with employee, supervisor, and vaccine officer escalation.

**Certificate Entry:**
- Manual entry by administrator
- QR code scan via ZMI App

**Status Types:**
- Valid
- Needs review (name mismatch)
- Rejected

---

## 4.26 History

Track all changes to personnel data:
- What changed
- Who changed it
- When changed

Click **Vergleichen** to see differences between entries.

---

## 4.27 Search Functions

### 4.27.1 Search Tab

Filter by multiple criteria. Filters persist when switching between tabs.

Click **Filter löschen** to clear all filters.

### 4.27.2 Employee Tab

Double-click search result to open employee record.

### 4.27.3 Sort Options

Customize grid sorting (see Grid Operation chapter).

### 4.27.4 Tree View Tab

Hierarchical view based on Baumstruktur (tree structure):
- Used for WebClient access control
- Create structure via settings button
- Assign employees to tree nodes

---

## 4.28 Evaluation (Auswertung)

Click **Auswerten** for detailed views:

| Tab | Content |
|-----|---------|
| **Tageswerte** | Daily totals, expand for booking details |
| **Monatswerte** | Monthly summary values |
| **Tageskonten** | Daily account balances |
| **Monatskonten** | Monthly account balances |
| **Jahresübersicht** | Graphical yearly overview |

---

## 4.29 Close Month (Monat abschließen)

Lock months from further changes:
1. Click lock button
2. Select employees (Ctrl+click or "Select all")
3. Choose month to close through
4. Confirm

> **Warning:** Closed months cannot be edited until reopened.

---

## 4.30 Reopen Months (Monate entsperren)

Unlock previously closed months:
1. Click unlock button
2. Select employees
3. Choose month to reopen from
4. Confirm

Previous months remain closed; only selected month and forward are reopened.
