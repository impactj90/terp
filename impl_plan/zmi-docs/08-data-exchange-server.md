# ZMI Time - Part 8: Data Exchange and ZMI Server

## 11. Data Exchange (Datenaustausch)

Interface for exporting time data to external payroll systems.

**Supported Systems:**
- Datev, LODAS
- Hamburger Software
- Softresearch Lohn XXL
- Lexware Lohn+Gehalt
- GDI-Lohn
- MS Excel (xls, csv)
- Others

---

### 11.1 Setting Up Data Paths

**Required Folder Structure:**

```
[Data Directory]
    └── Export
        ├── [Export Script Files]
        └── [Output Folder]
```

---

### 11.2 Interface Configuration

**Required Fields:**

| Field | Description |
|-------|-------------|
| **Nummer** | Unique interface number |
| **Bezeichnung** | Unique interface name |
| **Mandantennummer** | Your mandant number in payroll system |
| **Skript** | Export script from Export folder |
| **Exportpfad** | Destination folder for export file |
| **Dateiname** | File name with extension |

---

### 11.3 Adding Accounts

Select which accounts and monthly values to export:
1. Open account selector
2. Check desired accounts
3. Ensure each account has correct payroll type (Lohnart)
4. Ensure "Exportieren" is checked in account settings

---

### 11.4 Data Export

Use the **Datenexport** module to generate export file:
1. Select interface
2. Select period
3. Click Export
4. File created in export folder
5. Import file into payroll system

---

## 12. ZMI Server

Automated task scheduler for daily operations.

**Typical Deployment:**
- Installed on always-on server
- Runs as service or from Autostart
- Processes bookings and calculations automatically

---

### 12.1 Functions and Schedules

**Creating a Schedule:**
1. Click **New**
2. Enter description
3. Set execution timing
4. Add tasks
5. Save

**Execution Time Options:**

| Type | Description |
|------|-------------|
| **Alle n Sekunden** | Every n seconds (real-time polling) |
| **Alle n Minuten** | Every n minutes |
| **Alle n Stunden** | Every n hours (or n min after hour) |
| **Täglich** | Daily at specific time |
| **Wöchentlich** | Weekly on specific day and time |
| **Monatlich** | Monthly on specific day and time |
| **Manuell** | Only on-demand (button click) |

---

### 12.2 Available Tasks

#### Core Tasks

| Task | Description |
|------|-------------|
| **Tage mit neuen Buchungen berechnen** | Recalculate days with new bookings |
| **Monate berechnen (Alle MA)** | Calculate current month for all active employees |
| **Monate berechnen (Alle MA, ganzer Monat)** | Calculate entire month through month-end |
| **Aufträge berechnen** | Recalculate orders with new bookings (ZMI Auftrag) |
| **Tabellen sichern** | Create database backup (ZIP archive) |
| **Fahrzeugdaten berechnen** | Calculate vehicle data (if module licensed) |
| **Alive-Datensatz senden** | Send monitoring email |

#### Communication Tasks

| Task | Description |
|------|-------------|
| **Push Notifications versenden** | Send mobile push notifications |
| **SMS Versand** | Send SMS messages |

#### Compliance Tasks

| Task | Description |
|------|-------------|
| **Führerscheinkontrolle** | Process driver's license checks |
| **Impfstatuskontrolle** | Process COVID certificate checks |
| **DSGVO** | Execute GDPR data deletion |

#### Analysis Tasks

| Task | Description |
|------|-------------|
| **Buchungs-Geodaten hinzufügen** | Add geo coordinates to bookings |
| **Buchungen Geokodieren** | Geocode bookings |
| **Analysen aktualisieren** | Update dashboard analytics |

#### Terminal Communication Tasks

| Task | Description |
|------|-------------|
| **Buchungsdaten aus Terminal(s) holen** | Retrieve bookings from terminals |
| **Datum/Uhrzeit an Terminal(s) setzen** | Sync time to terminals |
| **Zeitkonten an Terminal(s) senden** | Send time account values |
| **Zutrittsdaten an Terminal(s) senden** | Send access profiles (with Stammdaten) |
| **Stammdaten an Terminal(s) senden** | Send employee master data to terminals |

#### Custom Tasks

| Task | Description |
|------|-------------|
| **Eigene Funktion** | Execute custom batch file |

---

### Recommended Schedule Configuration

#### High Frequency (Status Display)
```
Every 2-5 minutes:
- Buchungsdaten aus Terminal(s) holen

With exclusion times:
- Skip during backup window
```

#### Daily (Core Processing)
```
Early morning (e.g., 5:00):
1. Tabellen sichern (Backup first!)
2. Monate berechnen (Alle MA)
3. Push Notifications versenden
```

#### Weekly
```
Sunday 4:00-8:00:
- Datum/Uhrzeit an Terminal(s) setzen

(Important for daylight saving time changes)
```

> **Tip for DST:** Keep PC running over time change weekends.

---

### Task Execution Order

Multiple tasks in one schedule execute top to bottom.

**Recommended order:**
1. Backup
2. Import/sync
3. Calculations
4. Notifications
5. Exports

---

### Monitoring

**Manual Execution:**
1. Select schedule
2. Click "Ausführen"

**Pause Execution:**
1. Click "Unterbrechen"
2. Make changes
3. Resume

**Alive Monitoring:**
Configure in System Settings → ZMI Server Alive:
- Email on errors
- Email if calculation not complete by deadline

---

## Custom Batch Files

Create custom automation:
1. Create .bat file in Export folder
2. Define in ZMIServer.ini
3. Appears as "Eigene Funktion" in task list

---

## System Architecture

```
Terminals
    ↓ (Bookings)
ZMI Server
    ├── Retrieves bookings
    ├── Calculates times
    ├── Updates accounts
    └── Sends notifications
    ↓
ZMI Time Database
    ↓
User Interface (ZMI Time / WebClient)
    ├── View/Edit
    ├── Reports
    └── Exports
    ↓
Payroll System
```

---

## Troubleshooting

### Bookings Not Appearing
1. Check terminal connection
2. Verify schedule is running
3. Check for errors in log

### Calculations Not Running
1. Verify ZMI Server is running
2. Check schedule configuration
3. Review Alive monitoring alerts

### Time Sync Issues
1. Schedule weekly time sync
2. Ensure PC time is accurate (NTP)
3. Consider network time source

### Backup Failures
1. Check disk space
2. Verify path permissions
3. Review backup log
