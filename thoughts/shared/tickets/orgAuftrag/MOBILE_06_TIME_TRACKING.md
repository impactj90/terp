# MOB_06 — Zeiterfassung (Timesheet, Stechuhr, Teamuebersicht)

| Field | Value |
|-------|-------|
| **Module** | Time Tracking |
| **Dependencies** | MOB_01, MOB_02 (Data Table), MOB_03 (Form/Dialog) |
| **Complexity** | L |
| **Priority** | Hoechste Prioritaet (taegliche Nutzung durch alle Mitarbeiter) |
| **New Models** | — |

---

## Ist-Zustand

- Timesheet: `src/app/[locale]/(dashboard)/timesheet/page.tsx` — Tabellenansicht mit Buchungen pro Tag
- Stechuhr (Time-Clock): `src/app/[locale]/(dashboard)/time-clock/page.tsx` — Kommen/Gehen-Buttons
- Teamuebersicht: `src/app/[locale]/(dashboard)/team-overview/page.tsx` — Tabelle aller Teammitglieder
- Timesheet-Tabelle hat viele Spalten (Datum, Kommen, Gehen, Pause, Ist, Soll, Differenz, Buchungstyp)
- Buchungs-Formular als Sheet

---

## Goal

Zeiterfassung als primaerer Mobile-Use-Case: Stechuhr als One-Tap-Aktion, Timesheet als tagesweise Kartenansicht, Teamuebersicht kompakt. Diese Seiten werden am haeufigsten mobil genutzt.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/timesheet` | Timesheet-Page | Mobile-Kartenansicht fuer Buchungen |
| `/time-clock` | Time-Clock-Page | Grosse Touch-Buttons, kompaktes Layout |
| `/team-overview` | Team-Overview-Page | Kompakte Mitarbeiterliste |

---

## Aenderungen

### Stechuhr (Time-Clock)

- **Primaer-Aktion**: Grosser "Kommen"/"Gehen"-Button, min. 64px Hoehe, volle Breite auf Mobile
- Status-Anzeige: "Eingestempelt seit 08:15" gut lesbar
- Letzte Buchungen: kompakte Liste darunter
- Aktuelle Arbeitszeit: grosse Zahl, prominent
- Layout: zentriert, viel Whitespace, keine Ablenkung

### Timesheet

Mobile-Ansicht als Tageskarten statt Tabelle:

```tsx
// Mobile: Kartenansicht pro Tag
// Desktop: Tabelle (bestehendes Verhalten)
<div className="space-y-2 sm:hidden">
  {days.map(day => (
    <DayCard key={day.date}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Mo, 31.03.</span>
        <span className="text-sm text-muted-foreground">8:00 Std</span>
      </div>
      <div className="mt-1 flex gap-4 text-sm text-muted-foreground">
        <span>08:00 – 16:30</span>
        <span>Pause: 30min</span>
      </div>
    </DayCard>
  ))}
</div>

{/* Desktop: normale Tabelle */}
<div className="hidden sm:block">
  <DataTable ... />
</div>
```

- Tap auf Tageskarte oeffnet Detail/Bearbeitung
- Wochennavigation: Swipe oder Prev/Next-Buttons
- Monatssumme: kompakte Anzeige oben

### Teamuebersicht

- Mobile: Mitarbeiterliste als kompakte Cards
- Status-Badge (Anwesend/Abwesend/Urlaub) prominent
- Avatar + Name + Status in einer Zeile
- Tap oeffnet Detail-Ansicht
- Filter (Team, Abteilung): als horizontaler Scroll auf Mobile

### Buchungs-Formular (Sheet)

- Fullscreen-Sheet auf Mobile (MOB_03 Pattern)
- Grosse Zeitpicker (Touch-optimiert)
- Datum: nativer Date-Picker auf Mobile (`type="date"`)
- Buchungstyp-Select: grosse Optionen

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(dashboard)/timesheet/page.tsx` | Mobile-Kartenansicht |
| `src/app/[locale]/(dashboard)/time-clock/page.tsx` | Grosse Touch-Buttons |
| `src/app/[locale]/(dashboard)/team-overview/page.tsx` | Kompakte Mitarbeiterliste |
| `src/components/time/` | Timesheet-Card, Booking-Form Mobile |
| `src/components/time/booking-form.tsx` (o.ae.) | Touch-optimierte Zeitpicker |

---

## Tests

### Manuelle Tests

- [ ] Stechuhr: One-Tap Kommen/Gehen auf 375px
- [ ] Timesheet: Tageskarten statt Tabelle auf Mobile
- [ ] Tageskarte: Tap oeffnet Bearbeitung
- [ ] Wochennavigation funktioniert auf Mobile
- [ ] Teamuebersicht: kompakte Cards mit Status
- [ ] Buchungs-Sheet: Fullscreen, Zeitpicker benutzbar

---

## Acceptance Criteria

- [ ] Stechuhr: Kommen/Gehen-Button min. 64px hoch, volle Breite auf Mobile
- [ ] Stechuhr: aktuelle Arbeitszeit und Status prominent sichtbar
- [ ] Timesheet: Kartenansicht auf Mobile (< sm), Tabelle auf Desktop
- [ ] Timesheet: Wochennavigation touch-freundlich
- [ ] Teamuebersicht: kompakte Mitarbeiterkarten auf Mobile
- [ ] Buchungs-Formular: Fullscreen-Sheet mit Touch-optimierten Eingabefeldern
- [ ] Alle interaktiven Elemente >= 44x44px Touch-Target
