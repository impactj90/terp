# ZMI Time - Part 1: Overview and Module Bar

## 1. Program Start

Start the program via Start → Programs → ZMI → ZMI Time.
Alternatively, create a desktop shortcut.

### Default Login Credentials
- **Username:** zmi
- **Password:** zmi
- Case-sensitive

> **Note:** The user "zmi" is the default user with full rights in ZMI Time.

**Recommendation:** Create a separate user login for each user.

---

## 2. The ZMI Module Bar

After program start, you see the ZMI Module Bar - the control center of ZMI Time.

### Module Bar Features
- Can be shown/hidden to use full screen width
- Groups can be opened/closed
- Configurable via "Modulleiste einstellen" (Configure Module Bar)

### 2.1 Favorites
- Create a favorites list with frequently used modules
- Drag and drop modules to the favorites area

### 2.2 Administration (Verwaltung)

| Module | Description |
|--------|-------------|
| **Mandantenstamm** | Company data and holiday definitions |
| **Benutzerverwaltung** | User management with detailed access rights |
| **Systemeinstellungen** | System-wide company-specific settings |
| **Datenaustausch** | Payroll interface setup |

### 2.3 Defaults (Vorgaben)

| Module | Description |
|--------|-------------|
| **Abteilungen** | Department management |
| **Teams** | Group employees into teams |
| **Mitarbeitergruppen** | Employee groups for ZMI Connect |
| **Zeitpläne** | Time plan management |
| **Tarifdefinition** | Tariff template management |
| **Fehltage** | Absence day types (beyond standard) |
| **Berechnung** | Absence calculation rules |
| **Konten** | Account definitions |
| **Terminals** | Terminal configuration |
| **Kostenstellen** | Cost centers (optional module) |
| **Fahrzeuge** | Vehicles (optional module) |
| **Maschinen** | Machines (optional module) |
| **Arbeitsplatz- und Schichtplanung** | Workplace and shift planning (optional) |

### 2.4 Data (Daten)

| Module | Description |
|--------|-------------|
| **Personalstamm** | Employee master data management |
| **Auftragsdaten** | Order data (ZMI Auftrag module) |
| **Globale Tätigkeiten** | Global activities (ZMI Auftrag module) |
| **Buchungsübersicht** | Booking overview - view and edit all bookings |
| **Korrekturassistent** | Correction assistant for booking errors |
| **Urlaubsplaner** | Graphical vacation planner |
| **Fahrstrecken** | Routes (vehicle data module) |
| **Maschinendaten** | Machine data (multi-machine module) |
| **Kalkulationsübersicht** | Calculation overview (ZMI Auftrag) |

### 2.5 Reports (Bericht)

| Module | Description |
|--------|-------------|
| **Reports** | All available reports in ZMI Time |
| **Auswertungen** | Custom query builder |

### 2.6 Miscellaneous (Sonstiges)

| Module | Description |
|--------|-------------|
| **Datenexport** | Export data for payroll interface |

### 2.7 Info

Displays:
- Birthday list
- File entries for follow-up
- Program version information
- Used software components
- System information
- License information (active/passive employees, licensed modules)
- Remote support tool download
- Manual (PDF)

---

## Key Concepts

### Multi-Mandant (Multi-Tenant)
- System supports multiple companies/mandants
- Each mandant has separate data
- Holidays must be set up per mandant

### User Rights
- Granular permission system
- Rights per module (read/write/delete)
- Rights per data field
- Rights per employee group

### Module Activation
- Not all modules visible by default
- Depends on licensed features
- Optional modules: Auftrag, Kostenstelle, Fahrzeugdaten, etc.
