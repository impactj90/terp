# ZMI Time - Part 6: Evaluations and Grid Operations

## 9. Evaluations (Auswertungen)

Custom query builder for flexible data analysis.

---

### 9.1 Daily Values (Tageswerte)

Query daily time data:

| Field | Description |
|-------|-------------|
| Fehltag | Absence day type |
| Feiertag | Holiday indicator |
| GesamtSumme | Total hours |
| Tagesnetto | Net daily hours |
| Tagesbrutto | Gross daily hours |

> **Note:** One row per day is displayed.

---

### 9.2 Bookings (Buchungen)

Access booking-level data:

| Field | Description |
|-------|-------------|
| Buchungsart | Booking type |
| Original time | Raw terminal time |
| Editiert time | Edited time |
| Bewertet time | Calculated time |
| Auftragssummen | Order totals (ZMI Auftrag) |

**Option:** "Tage ohne Buchungen anzeigen" - Include days without bookings

> **Note:** Multiple rows per day possible (one per booking).

---

### 9.3 Terminal Bookings (Terminal-Buchungen)

Raw terminal transaction data:
- Primarily for access control analysis
- Shows original unprocessed bookings

> **Note:** Some terminals process data directly and may not show here.

---

### 9.4 File Entries (Akteneinträge)

Query personnel and order file entries:
- Personnel master file entries
- Order data file entries

---

### 9.5 Workflow History (Antragsverlauf)

Track workflow request processing:
- Requestor
- Date range
- Request type
- Status

---

### 9.6 Log Entries (Logeinträge)

Audit trail queries:

**Booking Changes:**
- User who made change
- Date/time of change
- What was changed

**Absence Day Changes:**
- User who made change
- Absence day affected
- Old/new values

**Monthly Account Changes:**
- Account modifications
- Value changes

---

## 9.7 Grid Operations (Bedienung des Grids)

The flexible grid system allows complete layout customization.

### 9.7.1 Layout Customization

**Grouping:**
1. Drag column headers to gray grouping area
2. Data groups by those columns
3. Multiple levels supported

**Column Visibility:**
- Click column selector icon
- Or right-click any column header
- Check/uncheck columns to show/hide

**Column Order:**
- Drag and drop columns to rearrange

**Column Customization Dialog:**
1. Right-click column → "Anpassen"
2. Drag columns from dialog to grid
3. Drag columns from grid to dialog to hide

**Footers:**
1. Right-click any column
2. Select "Fußzeile anzeigen" (show footer)
3. Optionally "Gruppenfußzeile" (group footer)
4. Footer appears at bottom
5. Group footer appears after each group

### 9.7.2 Saving and Loading Layouts

| Button | Function |
|--------|----------|
| **Save** | Store current layout |
| **Load** | Retrieve saved layout |
| **Reset** | Restore default layout |

> **Note:** Filters are NOT saved with layouts.

### 9.7.3 Excel Export

1. Right-click anywhere in grid data
2. Select export option
3. Choose save location
4. Opens in Excel or Excel Viewer

> **Requirement:** Microsoft Excel or free Excel Viewer must be installed.

---

## Grid Features Summary

### Sorting
- Click column header to sort
- Click again to reverse
- Hold Shift + click for multi-column sort

### Filtering
- Click filter icon in column header
- Select filter criteria
- Combine multiple column filters

### Grouping
- Drag columns to grouping area
- Expand/collapse groups
- Calculate group totals in footers

### Sizing
- Drag column borders to resize
- Double-click border to auto-fit

### Freezing
- Fixed columns stay visible during scroll
- Configure in column properties

---

## Evaluation Workflow

```
1. Select Evaluation Type
   (Tageswerte, Buchungen, Terminal-Buchungen, etc.)
         ↓
2. Set Date Range
         ↓
3. Apply Filters
   (Employee, Department, etc.)
         ↓
4. Customize Grid Layout
   (Columns, Grouping, Sorting)
         ↓
5. View Results
         ↓
6. Export to Excel (optional)
         ↓
7. Save Layout for Future Use (optional)
```

---

## Common Evaluation Use Cases

### Overtime Analysis
1. Select Tageswerte
2. Show columns: Employee, Date, Overtime
3. Group by Employee
4. Add group footer with sum
5. Filter date range

### Absence Overview
1. Select Tageswerte
2. Show columns: Employee, Date, Absence Type
3. Filter: Absence Type is not empty
4. Group by Absence Type

### Booking Audit
1. Select Logeinträge
2. Filter by date range
3. Filter by user (optional)
4. Review changes

### Core Time Violations
1. Select Tageswerte
2. Filter for core time violation flag
3. Group by Employee
4. Count violations per employee
