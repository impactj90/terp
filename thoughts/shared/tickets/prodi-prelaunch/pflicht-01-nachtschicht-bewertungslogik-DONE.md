# Nachtschicht-Bewertungslogik: Absenz-Service konsumiert dayChangeBehavior

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Zentraler Pain Point der HR-Abteilung.

**Vertikal-relevant**: Jeder Kunde mit Nachtschichten (Industriedienstleister, Reinigung, Logistik, Fertigung) braucht korrekte Absenz-Tageszuordnung. Terp hat die nötige Konfiguration bereits pro DayPlan (`dayChangeBehavior`) — sie wird nur vom Absenz-System nicht gelesen.

**Handbuch-Referenzen**:
- Abschnitt "Tageswechselverhalten" am Tagesplan (~Zeile 1023)
- Abschnitt 6.5 "Tageswechsel bei Nachtschichten" (~Zeile 2621)
- Urlaubsstunden-Gutschrift folgt dem konkreten Tagesplan pro Kalendertag (~Zeile 2963)

## Problem / Pain Point

Das Absenz-System bucht Urlaub und Krankmeldungen für Nachtschicht-Wochen falsch:

- MA arbeitet in Nachtschicht (So 22:00 → Mo 06:00, Mo 22:00 → Di 06:00, ...)
- MA beantragt Urlaub Mo–Fr
- **Erwartung**: Urlaubstage Mo, Di, Mi, Do, Fr
- **Ist-Zustand**: Urlaubstage So, Mo, Di, Mi, Do (der Sonntag wird abgezogen, Freitag fehlt)

Alle nachgelagerten Auswertungen (Urlaubskonto, Lohnabrechnung, DATEV-Export) sehen die falsch zugeordneten Tage.

**Root Cause im Code**: `DailyCalcService` konsumiert `DayPlan.dayChangeBehavior` korrekt — die Zeitberechnung ordnet Bookings dem richtigen Kalendertag zu (`daily-calc.ts:484-526` → `applyDayChangeBehavior()` in `daily-calc.helpers.ts:251-293`). Aber `absences-service.ts:createRange()` ignoriert das Feld komplett. `shouldSkipDate()` (`absences-service.ts:120`) prüft nur:
1. Wochenende (Sa/So)?
2. Kein `EmployeeDayPlan` für diesen Tag?
3. `dayPlanId === null` (Off-Day)?

Keinerlei Bezug zu `dayChangeBehavior`, `comeFrom`, `goTo` oder sonstiger Shift-Semantik. Die Query `findEmployeeDayPlans()` (`absences-repository.ts:200-215`) selektiert nur `planDate` + `dayPlanId` — sie lädt nicht einmal den DayPlan.

**Diskrepanz**: DailyCalcService sagt "Mo-Nachtschicht (So 22:00→Mo 06:00) = Montag", Absenz-Service sagt "Sonntag hat einen DayPlan → Arbeitstag → Urlaubstag". Zwei Systeme, die dieselbe Frage unterschiedlich beantworten.

## Akzeptanzkriterien

1. **Bestehende Konfiguration konsumieren**: Die Absenz-Logik konsumiert das bestehende `DayPlan.dayChangeBehavior`-Feld. Kein neues Konfigurations-Feld wird eingeführt. Pro Kalendertag wird der für den Mitarbeiter aktive `EmployeeDayPlan` → `DayPlan` → `dayChangeBehavior` gelesen; die Absenz-Tag-Zuordnung folgt dieser Konfiguration.
2. **Modus `at_departure`**: Nachtschicht So 22:00→Mo 06:00, Urlaub Mo–Fr → Urlaubstage Mo, Di, Mi, Do, Fr. Sonntag wird nicht abgezogen (Sonntag ist Ankunftstag, die Schicht gehört zum Montag).
3. **Modus `at_arrival`**: Selbes Szenario → Urlaubstage So, Mo, Di, Mi, Do. Sonntag wird abgezogen (Sonntag ist Ankunftstag, die Schicht gehört zum Sonntag). Freitag fällt raus.
4. **Modus `auto_complete`**: Absenz wird 1:1 pro Kalendertag gebucht, wie bei `none`. Jeder Kalendertag mit einem EmployeeDayPlan ist absenzfähig. Eine Nachtschicht verbraucht potenziell 2 Urlaubstage (Mo 2h + Di 6h). Das ist bewusst so — siehe Design-Entscheidung 1 unten.
5. **Modus `none`**: Verhalten identisch zum heutigen Ist-Zustand. Keine Verhaltensänderung.
6. **Krankmeldung analog**: Identische Logik wie bei Urlaub für alle AbsenceTypes.
7. **Urlaubskonto korrekt**: `recalculateVacationTaken()` in `absences-service.ts` berechnet `taken` konsistent zur neuen Tageszuordnung. `vacationDeduction`-Faktor aus dem DayPlan des effektiven Arbeitstags wird verwendet.
8. **DATEV-Export konsistent**: Lohnabrechnung und DATEV-Export sehen dieselbe Tageszuordnung wie die Absenz-Buchung, weil beide über DailyCalcService → `dayChangeBehavior` laufen (bereits korrekt — keine Änderung nötig, nur Verifikation).
9. **DailyCalcService unverändert**: Die bestehende `applyDayChangeBehavior()`-Logik in `daily-calc.helpers.ts` wird nicht funktional geändert, nur refactored: der neue gemeinsame Helper wird intern genutzt.
10. **Handbuch-Update**: Abschnitt 6.5 in `TERP_HANDBUCH.md` wird erweitert mit: Absenz-Wirkung pro Modus (wie viele Urlaubstage verbraucht werden, wie Stunden gutgeschrieben werden), Empfehlung gegen `auto_complete` bei klassischen Nachtschichten, Beispieltabelle für typische Mo–Fr Urlaubswoche im Nachtschicht-Kontext.
11. **UI-Warnung**: Die Tagesplan-Konfigurations-UI (`day-plan-form-sheet.tsx`) zeigt bei Auswahl von "Auto-Abschluss um Mitternacht" einen informativen, nicht-blockierenden Hinweis: "Hinweis: 'Auto-Abschluss um Mitternacht' führt dazu, dass Nachtschicht-Urlaube mehrere Urlaubstage verbrauchen (jeder Kalendertag zählt separat). Für klassische Nachtschichten empfehlen wir 'Bei Ankunft' oder 'Bei Gehen'." Kein Modal, dezenter Hinweis unterhalb des Dropdowns.
12. **Urlaubsstunden-Gutschrift korrekt**: Die Urlaubsstunden-Gutschrift (`totalTaken += vacationDeduction * duration`) folgt dem korrekt zugeordneten Kalendertag. Weil `vacationDeduction` aus dem DayPlan des Absenz-Tags gelesen wird (`absences-service.ts:recalculateVacationTaken()`), führt die korrekte Tag-Zuordnung durch den neuen Helper automatisch zur korrekten Stunden-Gutschrift. Die Gutschrift wird explizit getestet, nicht nur implizit vorausgesetzt.

## Test-Anforderungen

### Unit-Tests (Vitest)

**Primäres Test-Target: `resolveEffectiveWorkDay()`** (neuer Pure-Function-Helper in `src/lib/services/shift-day-resolver.ts`)

Signatur: `resolveEffectiveWorkDay(calendarDate, dayPlanForDate, dayPlanForPreviousDate, dayPlanForNextDate) → { isWorkDay: boolean, effectiveDate: Date | null }`

#### Modus `none` (Rückwärtskompatibilität)
- Tagschicht Mo 08:00→16:00, Urlaub Mo → effectiveDate = Mo, isWorkDay = true
- Kein DayPlan für Mo → isWorkDay = false (skip)
- DayPlan mit dayPlanId=null (Off-Day) → isWorkDay = false (skip)
- Wochenende Sa → isWorkDay = false (unabhängig von DayPlan)

#### Modus `at_departure`
- **Happy Path**: DayPlan Vortag (So) hat `at_departure` + Nachtschicht-Config, DayPlan aktueller Tag (Mo) existiert → effectiveDate = Mo, isWorkDay = true (Schichtende-Tag)
- **Sonntag fällt raus**: Selbes Szenario, gefragt für So → isWorkDay = false (So ist Ankunftstag, Schicht gehört zu Mo)
- **Freitags-Nachtschicht**: DayPlan Do hat `at_departure` + Nachtschicht, Freitag hat DayPlan → effectiveDate = Fr, isWorkDay = true
- **Nachtschicht Fr→Sa**: DayPlan Fr hat `at_departure`, Sa ist Wochenende → für Fr: isWorkDay = false (Schicht gehört zu Sa), für Sa: Wochenende → skip
- **Feiertag-Übergang (So→Mo, Feiertag Mo)**: effectiveDate = Mo (Feiertag). Ob der Feiertag als Urlaubstag zählt hängt von der bestehenden AbsenceType/DayPlan-Konfiguration ab — kein Sonderfall in der neuen Logik.
- **Gemischte Rotation**: MA hat Mo Tagschicht (`none`), Di Nachtschicht (`at_departure`) → Mo wird normal bewertet, Di/Mi nach `at_departure`

#### Modus `at_arrival`
- **Nachtschicht So 22:00→Mo 06:00**: Gefragt für So → effectiveDate = So, isWorkDay = true (Ankunftstag = Arbeitstag)
- **Gefragt für Mo (Departure-Tag)**: isWorkDay abhängig davon, ob Mo selbst einen eigenen Arbeitstag hat (eigener DayPlan mit Buchung). Wenn Mo nur das Ende der So-Nachtschicht ist → kein eigenständiger Arbeitstag.
- **Urlaub Mo–Fr**: So wird einbezogen (Ankunftstag), Mo nur wenn Mo auch eigenen DayPlan hat

#### Modus `auto_complete`
- **Nachtschicht So 22:00→Mo 06:00**: Jeder Kalendertag mit DayPlan ist eigenständig absenzfähig. So = Arbeitstag (wenn DayPlan), Mo = Arbeitstag (wenn DayPlan). Absenz an beiden Tagen = 2 Urlaubstage.
- **Verhalten identisch zu `none`** für die Absenz-Logik (pro-Tag-Prüfung).

#### Edge Cases (alle Modi)
- **Mitternachts-Grenzfall (00:00)**: Kein Sonderfall — Verhalten folgt dem bestehenden `dayChangeBehavior`-Code. Keine neue Logik.
- **Sommerzeit-Umstellung**: Nachtschicht über Zeitumstellung (letzter So im März/Oktober) → Datumswechsel basiert auf Kalendertag, nicht auf Uhrzeit → korrekt
- **Monatsübergang**: Nachtschicht 31.01 22:00→01.02 06:00, `at_departure` → effectiveDate = 01.02, korrekte Monats-/Jahresabgrenzung
- **Schaltjahr**: 28.02→29.02 im Schaltjahr → korrekt; 28.02→01.03 im Nicht-Schaltjahr → korrekt
- **Halbtags-Urlaub + Nachtschicht**: `duration=0.5` → korrekte Zuordnung zum effectiveDate, Dauer bleibt 0.5
- **Kein EmployeeDayPlan für Vortag**: Vortags-DayPlan nicht vorhanden → kein Nachtschicht-Kontext → Tag wird normal bewertet
- **Urlaubskonto**: `recalculateVacationTaken()` mit gemischten Tag-/Nachtschicht-MAs im selben Monat → korrekter Saldo pro MA

#### Urlaubsstunden-Gutschrift (AK 12)
- **`at_departure` + Urlaubsstunden**: Nachtschicht So 22:00→Mo 06:00 (DayPlan 8h Soll für Mo), Urlaub Mo → gutgeschriebene Stunden = 8h am Mo (nicht So, nicht 0h)
- **`at_arrival` + Urlaubsstunden**: Selbes Szenario → gutgeschriebene Stunden = 8h am So
- **`auto_complete` + Urlaubsstunden**: Nachtschicht mit 2h Mo + 6h Di, Urlaub Mo+Di → 2h gutgeschrieben am Mo, 6h am Di, Summe 8h
- **Teilzeit-Tagesplan**: Tagesplan mit 4h Soll statt 8h → Gutschrift folgt `vacationDeduction` des Tagesplans (nicht pauschal 8h)

#### Coverage-Lücken applyDayChangeBehavior (Refactoring-Pflicht)

Die bestehende `applyDayChangeBehavior()`-Funktion hat heute 4 Tests (je 2 für `at_arrival` und `at_departure`). Das Refactoring in einen gemeinsamen Helper MUSS diese 4 Tests beibehalten und zusätzlich Coverage-Lücken schließen, die beim Research identifiziert wurden:
- Multi-Pair-Szenarien (mehrere Booking-Paare an einem Tag)
- Mitternachts-Edge-Case (Schichtende exakt 00:00, `editedTime=0`)
- `auto_complete`-Modus (heute ohne direkte Test-Coverage in `daily-calc.helpers.test.ts`)
- `none`-Modus als Rückwärtskompatibilitäts-Anker

Die neue Test-Suite ist eine Erweiterung, nicht ein Ersatz.

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **`at_departure` End-to-End**: DayPlan mit `dayChangeBehavior="at_departure"` anlegen → Employee zuweisen → EmployeeDayPlan materialisieren → Urlaub Mo–Fr beantragen → AbsenceDay-Rows für Mo–Fr prüfen (nicht So–Do) → genehmigen → VacationBalance.taken prüfen
- **`at_arrival` End-to-End**: Analog, aber Urlaubstage So–Do erwartet
- **`auto_complete` End-to-End**: DayPlan mit `auto_complete` → Urlaub über Nachtschichtwoche → jeder Kalendertag mit DayPlan bekommt AbsenceDay → VacationBalance.taken = Summe der Tage × vacationDeduction
- **`none` Rückwärtskompatibilität**: DayPlan mit `none` → Verhalten identisch zum heutigen Verhalten (Regression-Test)
- **Gemischte Modi im selben Tenant**: MA rotiert über Früh (`none`), Spät (`none`), Nacht (`at_departure`) mit unterschiedlichen DayPlänen → Urlaubsbuchung über Rotation hinweg korrekt (jeder Tag nimmt den dayChangeBehavior seines eigenen DayPlans)
- **Multi-Tenant-Isolation**: Tenant A hat DayPläne mit `none`, Tenant B mit `at_departure` → gegenseitig unsichtbar, korrekte Berechnung pro Tenant
- **Krankmeldung-Flow**: AbsenceType mit `requiresApproval=false` + `at_departure`-DayPlan → auto-approved AbsenceDay-Rows auf korrekten Tagen
- **DATEV-Export-Verifikation**: Urlaub buchen mit `at_departure` → MonthlyValue schließen → DATEV-Export generieren → Urlaubstage im Export konsistent mit AbsenceDay-Zuordnung
- **Urlaubsstunden-Gutschrift End-to-End**: Urlaub mit `at_departure` buchen → genehmigen → sowohl `vacation_balances.taken` als auch `monthly_values.vacation_taken` prüfen → beide zeigen korrekten Saldo

**Hinweis: Zwei parallele vacationTaken-Berechnungen.** Die Urlaubssaldo-Berechnung existiert heute in zwei Pfaden — `vacation_balances.taken` (via `absences-service.ts:recalculateVacationTaken()`, multipliziert mit `vacationDeduction`) und `monthly_values.vacation_taken` (via `monthly-calc.ts:buildAbsenceSummary()`, summiert `duration` direkt). Beide sind konsistent von der Tag-Zuordnung abhängig und müssen in den End-to-End-Tests nach der Absenz-Buchung verifiziert werden. Ein Test der nur einen der beiden Pfade prüft lässt eine Konsistenz-Regression offen.

### Browser-E2E-Tests (Playwright)

- **HR bucht Urlaub für Nachtschicht-MA mit `at_departure`**: Login als HR → Employee mit Nachtschicht-DayPlan → Urlaub Mo–Fr beantragen → Kalender zeigt korrekte Tage (Mo–Fr, nicht So–Do)
- **MA sieht korrektes Urlaubskonto**: Login als MA → Urlaubsübersicht → Saldo korrekt nach genehmigtem Nachtschicht-Urlaub
- **UI-Warnung bei `auto_complete`**: Admin → Tagesplan bearbeiten → "Auto-Abschluss um Mitternacht" wählen → Warnung sichtbar unterhalb Dropdown → Speichern funktioniert trotzdem

## Design-Entscheidungen (getroffen)

Alle Design-Entscheidungen sind final. Pro-Di ist nicht produktiv, Tolga hat volle Design-Freiheit.

### 1. `auto_complete`-Modus bei Absenz

Bei `auto_complete` wird Absenz 1:1 pro Kalendertag gebucht — identisch zu `none`. Die Absenz-Logik fragt pro Kalendertag: "Gibt es eine geplante Arbeitszeit laut EmployeeDayPlan?" Wenn ja → absenzfähig.

**Bewusst akzeptierte Konsequenz**: Eine Nachtschicht-Abwesenheit verbraucht bei `auto_complete` potenziell 2 Urlaubstage (Mo + Di), während `at_departure` nur 1 Urlaubstag verbraucht (Di). Das ist kein Bug, sondern die logische Konsequenz der semantischen Konfigurationsentscheidung am Tagesplan ("jeder Kalendertag eigenständig" vs. "Schicht gehört zu einem Tag"). Wird durch Handbuch-Hinweis und UI-Warnung abgesichert.

### 2. Mitternachts-Grenzfall (Schichtende exakt 00:00)

Keine Sonderregel. Das Verhalten folgt der am Tagesplan konfigurierten `dayChangeBehavior`-Logik. Der bestehende Code in `applyDayChangeBehavior()` und `pairWorkBookingsAcrossDays()` behandelt Mitternacht konsistent — der neue Absenz-Helper übernimmt dieselbe Semantik.

### 3. Gemeinsamer Helper statt Duplikation

Neuer Pure-Function-Helper `resolveEffectiveWorkDay()` in `src/lib/services/shift-day-resolver.ts`. Die bestehende `applyDayChangeBehavior()` in `daily-calc.helpers.ts` wird refactored, um den neuen Helper intern zu nutzen. `absences-service.ts` konsumiert denselben Helper. Eine Quelle der Wahrheit, beide Consumer haben Tests über den geteilten Helper.

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `src/lib/services/shift-day-resolver.ts` | **Neu**: Pure Function `resolveEffectiveWorkDay(calendarDate, dayPlanForDate, dayPlanForPreviousDate, dayPlanForNextDate)`. Entscheidet anhand von `dayChangeBehavior` ob ein Kalendertag ein effektiver Arbeitstag für Absenz-Zwecke ist. |
| `src/lib/services/daily-calc.helpers.ts` | **Refactor**: `applyDayChangeBehavior()` nutzt intern den neuen Helper für die Tageszuordnungs-Entscheidung. Funktionales Verhalten bleibt identisch. |
| `src/lib/services/absences-service.ts` | **Erweitern**: `createRange()` und `shouldSkipDate()` konsumieren `resolveEffectiveWorkDay()`. `shouldSkipDate()` bekommt Zugriff auf die DayPläne des Vortags und Folgetags. |
| `src/lib/services/absences-repository.ts` | **Erweitern**: `findEmployeeDayPlans()` lädt zusätzlich `dayPlan.dayChangeBehavior`, `dayPlan.comeFrom`, `dayPlan.goTo`. Datumsbereich um ±1 Tag erweitern (Vortag für `at_departure`, Folgetag für `at_arrival`). |
| `src/lib/services/absences-service.ts` | **Erweitern**: `recalculateVacationTaken()` muss bei der Aggregation konsistent den effektiven Arbeitstag verwenden (gleicher Helper). |
| `src/components/day-plans/day-plan-form-sheet.tsx` | **Erweitern**: Nicht-blockierende Warnung unterhalb des `dayChangeBehavior`-Dropdowns (Zeilen 854-871) bei Auswahl von `auto_complete`. Nutzt bestehendes `<Alert>`-Pattern mit `AlertCircle`- oder `AlertTriangle`-Icon (Default-Variant, wie in `account-form-sheet.tsx:206-213`). Text über i18n-Namespace `adminDayPlans` lokalisiert. |
| `docs/TERP_HANDBUCH.md` | **Erweitern**: Abschnitt 6.5 "Tageswechsel bei Nachtschichten" (Zeile 2621) ist heute ein 11-Zeilen-Stub (ein Satz + Minimal-Tabelle). Die Erweiterung ist substantiell: Absenz-Wirkung pro Modus erläutern, Beispiel-Tabelle mit Urlaubstage-Verbrauch + Stunden-Gutschrift pro Modus, Empfehlungs-Hinweis gegen `auto_complete` bei klassischen Nachtschichten, Praxis-Beispiel analog zu Abschnitt 6.6. Zusätzlich: Querverweis von Urlaubskapitel (Abschnitt 7, aktuell KEINE Nachtschicht-Referenzen) zu 6.5 ergänzen. |

### Architektur: Gemeinsamer Helper

```
                    shift-day-resolver.ts
                    resolveEffectiveWorkDay()
                           |
              ┌────────────┴────────────┐
              v                         v
  daily-calc.helpers.ts         absences-service.ts
  applyDayChangeBehavior()      shouldSkipDate()
  (refactored, nutzt Helper)    createRange()
              |                 recalculateVacationTaken()
              v
  daily-calc.ts
  loadBookingsForCalculation()
```

### `resolveEffectiveWorkDay()` — Kern-Semantik

Input:
- `calendarDate`: Der Kalendertag, der geprüft wird
- `dayPlanForDate`: EmployeeDayPlan am calendarDate (nullable)
- `dayPlanForPreviousDate`: EmployeeDayPlan am calendarDate - 1 (nullable)
- `dayPlanForNextDate`: EmployeeDayPlan am calendarDate + 1 (nullable, nur für `at_arrival` relevant)

Output:
- `isWorkDay: boolean` — Soll für diesen Kalendertag ein Absenz-Tag gebucht werden?
- `effectiveDate: Date | null` — Der Kalendertag, dem der Arbeitstag zugeordnet wird

Logik pro Modus:
- **`none`** / **`auto_complete`**: `isWorkDay = dayPlanForDate?.dayPlanId != null`, `effectiveDate = calendarDate`. Identisches Verhalten, keine Cross-Day-Logik.
- **`at_departure`**: Prüft ob der Vortags-DayPlan eine Nachtschicht definiert (Erkennung via `goTo < comeFrom` oder explizite Overnight-Flagge). Falls ja: calendarDate ist der Schichtende-Tag → `isWorkDay = true`, `effectiveDate = calendarDate`. Der Vortag (Ankunftstag) wird als `isWorkDay = false` behandelt, weil seine Arbeitszeit zum calendarDate gehört.
- **`at_arrival`**: Prüft ob der aktuelle DayPlan eine Nachtschicht definiert, die in den Folgetag reicht. Falls ja: calendarDate ist der Ankunftstag → `isWorkDay = true`, `effectiveDate = calendarDate`. Der Folgetag (Departure-Tag) wird nur als Arbeitstag gezählt, wenn er einen eigenen DayPlan mit eigenständiger Schicht hat.

### DayPlan-Range für Helper

Der neue Helper `resolveEffectiveWorkDay()` muss beim Aufruf Zugriff auf DayPlans benachbarter Tage haben (typischerweise ±1 Tag), weil die Entscheidung "wohin gehört eine Nachtschicht" den DayPlan des Vortags oder Folgetags konsultieren muss. Der bestehende `DailyCalcContext` (`daily-calc.context.ts:122-138`) lädt DayPlans NICHT in erweiterter Range — nur die Booking-Range wird um ±1 Tag erweitert (`daily-calc.context.ts:116-117`). Das muss beim Refactoring angepasst werden. Die Absenz-Repository-Query (`findEmployeeDayPlans()`) muss ihre eigene Range unabhängig um ±1 Tag erweitern. Die genaue Ladestrategie (Eager-Loading im Context vs. Lazy-Fetch im Helper) entscheidet `/create_plan`.

### Nachtschicht-Erkennung

Die Funktion muss erkennen, ob ein DayPlan eine Nachtschicht ist. Heuristik basierend auf bestehenden DayPlan-Feldern:
- `goTo` (in Minuten ab Mitternacht) ist kleiner als `comeFrom` → Overnight-Schicht (z.B. comeFrom=1320 [22:00], goTo=360 [06:00])
- Oder: `dayChangeBehavior` ist `at_arrival` oder `at_departure` (die Konfiguration selbst ist der stärkste Hinweis)

### Auswirkung auf `shouldSkipDate()` in absences-service.ts

Heute (Zeile 120):
```typescript
function shouldSkipDate(date, dayPlanMap): boolean {
  // Weekend? Skip.
  // No EmployeeDayPlan? Skip.
  // dayPlanId === null? Skip.
}
```

Neu:
```typescript
function shouldSkipDate(date, dayPlanMap, resolverFn): boolean {
  // Weekend? Skip. (unverändert)
  // resolveEffectiveWorkDay() aufrufen mit dayPlanMap[date], dayPlanMap[date-1], dayPlanMap[date+1]
  // Wenn !isWorkDay → Skip.
}
```

## Risiko / Komplexität

**T-Shirt-Größe: L**

Herunter von XL, weil:
- Kein neues Datenmodell, keine Migration, kein neues Tenant-Setting
- Nutzung existierender, getesteter Semantik (`dayChangeBehavior` ist in DailyCalcService seit Monaten stabil)
- Absenz-Repository-Erweiterung ist minimal (zusätzliche Felder laden + ±1 Tag Range)

Aber weiterhin anspruchsvoll:
- Berührt Kern-Absenz-Logik, von der Urlaubskonto, Lohn und DATEV downstream abhängen
- Edge-Case-Matrix: 4 Modi × Mitternacht × Feiertag × Sommerzeit × Monatswechsel × Schaltjahr × gemischte Rotationen
- Refactoring von `applyDayChangeBehavior()` muss funktional identisch bleiben (Regression-Risiko)
- **Test-Aufwand: ~45% der Implementierungszeit** — die Matrix ist groß, aber die Tests über den geteilten Helper sind gut isolierbar

## Abhängigkeiten

- **Kein BLOCKER** — alle Design-Entscheidungen sind getroffen, Implementation kann sofort starten
- **SERIELL VOR Ticket 2 (DATEV-Zuschläge)**: Beide Tickets modifizieren `daily-calc.ts` bzw. benachbarte Calculation-Helper. Um Merge-Konflikte und parallele Refactoring-Arbeit am gleichen Code zu vermeiden, wird Ticket 1 vollständig fertiggestellt (inkl. Merge in den Entwicklungsbranch) BEVOR Ticket 2 gestartet wird. Diese serielle Reihenfolge ist bereits in der README-Reihenfolge abgebildet und wird hier nur explizit als technische Abhängigkeit festgeschrieben.
- Ticket 5 (Überstundenantrag) referenziert Nachtschicht-Bewertung für ArbZG-Validierung

## Out of Scope

- **Rückwirkende Migration bestehender Fehlbuchungen**: Nicht nötig. Pro-Di Cutover ist 01.10/01.11.2026 als Neueinstieg — keine mehrjährige Absenz-Historie wird migriert. Import aus ZMI beschränkt sich auf Salden (Resturlaub-Übertrag, Überstunden-Saldo zum Stichtag). Historische Tagesbuchungen werden nicht importiert. Ggf. separates Ticket "Pro-Di Datenmigration aus ZMI orgAuftrag" zum Cutover-Planungszeitpunkt.
- **Änderung der DailyCalcService-Kernberechnung**: Die bewertet bereits korrekt via `dayChangeBehavior`. Nur Refactoring zur Nutzung des gemeinsamen Helpers.
- **Schichtplanungs-UI-Änderungen** (außer der `auto_complete`-Warnung)
- **Zuschlagsberechnung** (Ticket 2)
- **Neues Tenant-Setting** (nicht nötig — `dayChangeBehavior` lebt am DayPlan, wo es hingehört)
- **Nachträgliche Änderung von `dayChangeBehavior`**: Wenn ein Admin nach der Absenz-Buchung das `dayChangeBehavior`-Feld eines DayPlans ändert, werden bereits existierende Absenz-Rows NICHT automatisch neu bewertet. Es gibt heute keinen Recalc-Trigger für diesen Fall (`day-plans-service.ts` ruft keinen `triggerRecalc` auf). Dieses Ticket fügt keinen solchen Trigger hinzu — das wäre ein separates Ticket mit anderer Tragweite (Auswirkung auf alle bestehenden Absenzen, rückwirkende Berechnung, Audit-Logging). In der Praxis ist der Fix hier: HR storniert die Absenz und bucht sie neu, nachdem der Tagesplan geändert wurde.

## Research-Erkenntnisse (eingearbeitet 16.04.2026)

Die Research-Datei `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md` hat das Ticket in folgenden Punkten geschärft:

- **Urlaubsstunden-Gutschrift** als eigenständiges Akzeptanzkriterium (AK 12) und Test-Cases aufgenommen (Research-Punkt 5)
- **Doppelte vacationTaken-Berechnung** (`vacation_balances` vs. `monthly_values`) als explizite Integration-Test-Anforderung verankert (Punkt 8)
- **DayPlan-Range-Erweiterung** im DailyCalcContext als Implementierungs-Hinweis für `/create_plan` dokumentiert (Punkt 8)
- **Nachträgliche DayPlan-Änderungen** explizit in Out-of-Scope aufgenommen, weil kein Recalc-Trigger existiert (Punkt 8)
- **Serielle Abhängigkeit zu Ticket 2** festgeschrieben, um Merge-Konflikte in `daily-calc.ts` zu vermeiden (Punkt 8)
- **Coverage-Lücken in applyDayChangeBehavior** als Pflicht-Ergänzung der Test-Suite benannt (Punkt 4)
- **UI-Warning-Pattern** konkret referenziert auf bestehende `<Alert>`-Nutzung mit Icon (Punkt 6)
- **Handbuch-Umfang** präzisiert: Abschnitt 6.5 ist ein Stub, die Erweiterung ist substantiell; Querverweis aus Kapitel 7 fehlt (Punkt 7)

Bestätigt wurde: DailyCalcService ist einziger Verhaltens-Consumer, `applyDayChangeBehavior` ist Pure Function ohne Seiteneffekte, UI-Pattern existiert, Handbuch-Struktur ist kollisionsfrei.
