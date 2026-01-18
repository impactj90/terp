# ZMI Time - Part 5: Absence Days, Teams, and Reports

## 6. Absence Days (Fehltage)

### 6.1 Editing Absence Types

**Naming Convention:**
- **K** prefix = Illness (Krankheit)
- **S** prefix = Special days (Sondertage)
- **U** prefix = Vacation (Urlaub)

**Fields:**

| Field | Description |
|-------|-------------|
| **Kürzel** | Short code (must follow K/S/U convention) |
| **Bezeichnung** | Full description |
| **Berechnung** | Calculation rule to apply |
| **Anteil** | Portion of regular hours credited: 0=none, 1=full, 2=half |
| **Kürzel am Feiertag** | Alternative code if falls on holiday |
| **Priorität** | Priority when holiday and absence overlap |
| **Farbe** | Color for vacation planner display |
| **F-Taste** | Function key shortcut (e.g., 6 = F6) |
| **Konto** | Associated account for tracking |

**Absence Day Groups:**
Click **Gruppen** to create groups for WebClient workflows.

---

## 6.2 Calculation (Berechnung)

Define rules for how absence days affect time accounts.

> **Important:** Calculation rules directly impact time evaluation. Consult support before modifying.

---

### 6.2.1 Accounts (Konten)

Accounts track specific time categories.

**Standard Functions Built-in:**
- Flextime account

**Custom Accounts For:**
- Sunday bonus
- Night bonus
- Special booking types (doctor visit, post run)
- Absence day markers
- Payroll interface values

**Account Fields:**

| Field | Description |
|-------|-------------|
| **Kontonummer** | Account number |
| **Bezeichnung** | Description |
| **Lohnart** | Payroll type code |
| **Format** | Decimal or Hours:Minutes |
| **Type** | Day account or Month account |
| **Zuschlag** | Bonus factor for macros/reports |
| **Jahresübertrag** | Carry forward to new year: Yes/No |
| **Exportieren** | Include in payroll export |

**Account Groups:**
Create groups for WebClient display using the Groups button.

---

### 6.2.2 Booking Types (Buchungsarten)

Control what employees can select at terminals.

**Standard Types:**
- A1 = Kommen (Arrive)
- A2 = Gehen (Leave)
- PA/PE = Break start/end
- DA/DE = Business trip start/end

**Creating Custom Booking Types:**

Example: Doctor Visit (Arztgang)
1. Create new booking type
2. Set code (e.g., "AR")
3. Set behavior: Kommen/Gehen
4. Assign tracking account
5. Add to booking type group

**Booking Type Groups:**
Determine which types appear at which terminals.

Click **BA-Gruppen** to manage groups.

Click **Buchen mit Grund** for special reason-based bookings (see Time Plans section).

---

## 7. Teams

Teams group employees for:
- Quick selection in vacation planner
- Report filtering
- Organization

### Creating Teams

1. Click **Neu**
2. Assign team number
3. Enter team name
4. Click **Hinzufügen** to add employees

**Notes:**
- Teams can have unlimited members
- Employees can belong to multiple teams

---

## 8. Reports in ZMI Time

Reports available from:
- Module bar (Bericht → Reports)
- Personnel master
- Order data
- Correction assistant

### 8.1 Report Overview

Access via: Module bar → Bericht → Reports(RB)

**Report Categories:**

### 8.1.1 Master Data Reports (Stammdaten)

| Report | Description |
|--------|-------------|
| Personal lists | Employee listings |
| Vacation lists | Vacation balances |
| Birthday lists | Employee birthdays |
| Phone lists | Contact directories |
| Day plans | Time plan printouts |
| Week plans | Weekly schedule printouts |

**Filters:**
- All departments
- All cost centers (if module licensed)

**Example: Vacation List**
Shows current vacation balances per employee.

### 8.1.2 Monthly Reports (Monatswerte)

| Report | Description |
|--------|-------------|
| Monthly report | Detailed monthly summary |
| Error reports | Booking errors |
| Absence statistics | Absence analysis |

**Filters:**
- Month selection (default: previous month)
- Department
- Cost center
- Individual employee

**Example: Monthly Report**
Complete breakdown of hours, overtime, absences per employee.

### 8.1.3 Variable Time Reports (Variable Zeitangaben)

| Report | Description |
|--------|-------------|
| Absence statistics | Absence analysis over time range |
| Cost center reports | If module licensed |
| Vacation slip | Printable vacation request |
| Access statistics | If ZMI Zutritt licensed |

**Filters:**
- Custom date range
- Department/cost center/employee

### 8.1.4 Project Reports (Projekte)

For ZMI Auftrag module - see separate documentation.

| Report | Description |
|--------|-------------|
| Order slip | Printable order form |
| Order reports | Order summaries |

### 8.1.5 Calculation Reports (Kalkulation)

For ZMI Auftrag module - see separate documentation.

| Report | Description |
|--------|-------------|
| Order evaluation | Cost/time analysis per order |

### 8.1.6 Team Reports

For ZMI Auftrag module - see separate documentation.

| Report | Description |
|--------|-------------|
| Monthly report with teams | Team-grouped monthly data |

---

## Report Output Options

All reports can be:
- Printed directly
- Exported to PDF
- Exported to Excel
- Previewed on screen

---

## Report Customization

Reports use ReportBuilder (RB) technology.
- Standard reports provided
- Custom reports can be created
- Contact ZMI for custom report development
