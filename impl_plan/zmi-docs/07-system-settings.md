# ZMI Time - Part 7: System Settings

## 10. System Settings (Systemeinstellungen)

Comprehensive system configuration options.

---

### 10.1 Options (Optionen)

**Booking Overview Settings:**
- Settings for ZMI Auftrag display

**Error Handling:**
- "Folgende Fehler berücksichtigen" - Which errors to track

**Auto-fill End Bookings:**
- For ZMI Auftrag: Auto-insert end time when order changes

**Rounding Relative to Plan:**
- If enabled: Round relative to planned start time
- If disabled: Round to absolute time intervals

Example with 15-minute rounding, plan start 8:10:
- Disabled: 8:11 → 8:15, 8:16 → 8:30
- Enabled: 8:11 → 8:25, 8:16 → 8:25

---

### 10.2 Paths / Backup

#### 10.2.1 Paths

| Path | Purpose |
|------|---------|
| **Datensicherungspfad** | Backup destination (default: database/Backup) |
| **Auftragsauswertungen** | Order reports (ZMI Auftrag) |
| **Importpfad Aufträge** | Order import (ZMI Auftrag) |
| **Akte Personaldaten** | Personnel file attachments |
| **Akte Auftragsdaten** | Order file attachments |
| **Dokumente Auslagen** | Expense documents |

#### 10.2.2 Backup Restore

Archives created by ZMI Server "Tabellen sichern" task.
- Named by weekday
- ZIP format
- Restore requires ZMI support (ZMIRestore.exe)

> **Important:** Complete database restore only. No partial recovery.

---

### 10.3 Vehicle Data (Fahrzeugdatenerfassung)

Settings for ZMI Vehicle Data module - see separate documentation.

---

### 10.4 Number Ranges (Nummernkreise)

For ZMI Auftrag module - see separate documentation.

---

### 10.5 Correction Messages (Korrekturmeldungen)

Customize error messages in Correction Assistant:
- Modify existing message texts
- Create custom messages (number 100+)
- Choose error or hint for max net work time exceeded

> **Note:** Custom messages typically used with macros.

---

### 10.6 Functions (Funktionen)

**Data cleanup tools - USE WITH EXTREME CAUTION!**

#### 10.6.1 Delete Bookings (Buchungen löschen)
Permanently delete bookings and remarks for date range.

#### 10.6.2 Delete Booking Data (Buchungsdaten löschen)
Delete bookings, time plans, annual plans for date range.

#### 10.6.3 Mark Orders Deleted (Aufträge gelöscht markieren)
Mark orders as deleted (filter by date or order number prefix).

#### 10.6.4 Delete Orders (Aufträge löschen)
Permanently delete orders for date range or by number prefix.

#### 10.6.5 Delete Vehicle Data (Fahrzeugdaten löschen)
Permanently delete routes for date range.

#### 10.6.6 Re-read Bookings (Buchungen erneut einlesen)
For database errors - consult ZMI support before using.

> **Warning:** Improper use can cause complete data loss! Always consult ZMI first.

---

### 10.7 Reports (Berichte)

WebClient report configuration - see WebClient documentation.

---

### 10.8 Program Start (Programmstart)

**Display at startup:**
- Follow-up entries (Wiedervorlage)
- Birthday list

Configure display windows (days before/after date).

> **Note:** Displayed employees depend on user permissions.

---

### 10.9 Order Data (Auftragsdaten)

ZMI Auftrag settings:
- Cross-mandant employee assignment
- orgAuftrag functions

---

### 10.10 Proxy Settings

Configure proxy server for:
- Email sending
- Internet access

---

### 10.11 ZMI Analyse

Dashboard connection settings (if licensed).

---

### 10.12 ZMI Server Alive

Monitoring and alerting:
- Send emails on errors
- Notify if calculation doesn't complete by expected time
- Alert ZMI support or customer

---

### 10.13 Access Settings (Zutritt-Einstellungen)

Access zone management for ZMI Zutrittskontrolle.

---

### 10.14 Travel Allowance (Aufwandsentschädigung)

ZMI Auslöse module settings for per diem calculations.

#### 10.14.1 Local Travel (Nahmontage)

Same-day trips (start and end on same day):

| Setting | Description |
|---------|-------------|
| **Gültigkeitszeitraum** | Validity period |
| **Kilometer** | Distance ranges |
| **Dauer** | Duration thresholds |
| **Steuerfrei** | Tax-free amount |
| **Steuerpflichtig** | Taxable amount |

**Calculation Options:**
- Per booking or per day
- Which distance for multiple stops

#### 10.14.2 Extended Travel (Fernmontage)

Multi-day trips (different start and end dates):

| Setting | Description |
|---------|-------------|
| **An-/Abreisetag** | Arrival/departure day rates |
| **Tage dazwischen** | Rates for days between |
| **Dreimonatsberechnung** | 3-month rule (same location) |

---

### 10.15 Contact Management (Kontaktmanagement)

Define custom contact field types:
1. Create contact types (left panel)
2. Add contact kinds with labels (right panel)
3. Available in Personnel Master → Contact Data

---

### 10.16 Vacation Calculation (Urlaubsberechnung)

#### Standard Calculation (Berechnung 1)
Built-in, cannot be modified.

#### Special Calculations (Sonderberechnung)

**Types:**

| Type | Description |
|------|-------------|
| **Alter** | Additional days by age |
| **Betriebszugehörigkeit** | Additional days by tenure |
| **Behinderung** | Additional days for disability |

**Creating Special Calculations:**
1. Click New
2. Enter name
3. Select type
4. Set threshold (Ab) and value

**Grouping Calculations:**
1. Click group button
2. Choose: Calendar year or entry date based
3. Name the group
4. Select which calculations to include

---

### 10.17 Capping Rules (Kappungsregeln)

#### 10.17.1 Year-End Capping
Forfeit remaining vacation at year end.

#### 10.17.2 Mid-Year Capping
Forfeit previous year's vacation by specific date (e.g., March 31).

**Grouping Rules:**
Similar to vacation calculations - group rules together.

> **Note:** Individual exemptions from capping possible - contact ZMI support.

---

### 10.18 Employment Type (Beschäftigungstyp)

Combine vacation and capping rules:
1. Create new type with number and name
2. Assign vacation calculation
3. Assign special calculation group
4. Assign capping rule group
5. For ZMI Auslöse: Day net or travel booking basis

Assign employment type to employees in Tariff tab.

---

### 10.19 System

| Setting | Description |
|---------|-------------|
| **PIN-Länge** | PIN number length |
| **Kartennummern-Länge** | Card number length |
| **Anhänge in DB** | Store file attachments in database |
| **SingleSignOn** | Enable Windows SSO |
| **Standard-Tagesplan** | Day plan for exit date |
| **Resturlaub negativ** | Allow negative vacation balance |
| **Passwort-Komplexität** | Password requirements: length, uppercase, lowercase, numbers, special characters |

---

### 10.20 Card Management (Ausweisverwaltung)

Define card types for Personnel Master → Cards tab.

---

### 10.21 Data Protection (Datenschutz)

GDPR compliance settings:
- Define retention periods per data type
- Configure automatic deletion

---

### 10.22 ZMI Archive (ZMI Archiv)

windream server connection settings (if licensed).

---

### 10.23 Controls (Kontrollen)

Assign responsible persons:
- Fleet manager (for driver's license control)
- Vaccine officer (for COVID certificate control)

---

### 10.24 SMS Sending (SMS-Versand)

SMS notification settings:
- Server configuration
- Low balance alerts

---

### 10.25 ZMI WebClient

| Setting | Description |
|---------|-------------|
| **Internal Base URL** | Internal network URL |
| **External Base URL** | External/public URL |

---

### 10.26 ZMI Onboarding

Define required fields for new employee creation (if module licensed).

---

## Configuration Best Practices

### Initial Setup Order
1. Mandant data and holidays
2. Departments
3. User groups and permissions
4. Time plans (day → week)
5. Accounts and booking types
6. Vacation/capping rules
7. Employees with tariffs

### Regular Maintenance
- Verify holiday calendar yearly
- Review vacation calculations
- Audit user permissions
- Check backup integrity
- Monitor error logs
