# ZMI Time - Verified Calculation Reference

> **Source**: ZMI Time Handbuch Version 6.4 (18.05.2022)
> **Purpose**: Verified reference for implementing ZMI Time clone
> **Created**: 2026-01-22

## Legend

| Marker             | Meaning                                  | Reliability        |
| ------------------ | ---------------------------------------- | ------------------ |
| 📗 **ORIGINAL**    | Word-for-word quote from manual (German) | 100% verified      |
| 📘 **TRANSLATION** | Direct English translation               | 100% verified      |
| 📙 **DERIVED**     | Logic/formula derived from description   | Needs verification |
| 📄 **PAGE**        | Page number in original PDF              | Reference          |

---

# Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Tagespläne - Day Plans](#2-tagespläne---day-plans)
3. [Festarbeitszeit - Fixed Working Time](#3-festarbeitszeit---fixed-working-time)
4. [Gleitzeit - Flexible Working Time](#4-gleitzeit---flexible-working-time)
5. [Pausen - Breaks](#5-pausen---breaks)
6. [Toleranz - Tolerance](#6-toleranz---tolerance)
7. [Abgleich - Rounding](#7-abgleich---rounding)
   - [Abgleich relativ zur Kommt-/Gehtzeit](#78-abgleich-relativ-zur-komm--gehtzeit)
8. [Sonderfunktionen - Special Functions](#8-sonderfunktionen---special-functions)
9. [Zuschläge - Surcharges](#9-zuschläge---surcharges)
10. [Schichterkennung - Shift Detection](#10-schichterkennung---shift-detection)
11. [Wochenpläne - Week Plans](#11-wochenpläne---week-plans)
12. [Monatsbewertung - Monthly Evaluation](#12-monatsbewertung---monthly-evaluation)
13. [Personalstamm - Employee Data](#13-personalstamm---employee-data)
14. [Tarif - Employment Contract](#14-tarif---employment-contract)
15. [Fehltage - Absence Days](#15-fehltage---absence-days)
16. [Konten - Accounts](#16-konten---accounts)
17. [Buchungsarten - Booking Types](#17-buchungsarten---booking-types)
18. [Feiertage - Holidays](#18-feiertage---holidays)
19. [Urlaubsberechnung - Vacation Calculation](#19-urlaubsberechnung---vacation-calculation)
20. [Kappungsregeln - Capping Rules](#20-kappungsregeln---capping-rules)
21. [Buchungsübersicht - Booking Overview](#21-buchungsübersicht---booking-overview)
22. [Offsetwerte - Initial Values](#22-offsetwerte---initial-values)
23. [Derived Formulas](#23-derived-formulas)
24. [Glossary](#24-glossary)

---

# 1. System Architecture

📄 **PAGE 36, 38**

## 1.1 Time Plan Hierarchy

📗 **ORIGINAL**:

> "In den Zeitplänen werden die Vorgaben der Arbeitszeit für die Mitarbeitenden festgelegt. Es gibt Festarbeitszeit- und Gleitzeitpläne."

📘 **TRANSLATION**:

> "In time plans, the working time specifications for employees are defined. There are fixed working time and flextime plans."

---

📗 **ORIGINAL**:

> "Die Tagespläne werden für die einzelnen Tage angelegt und danach in Wochenplänen zusammengefasst. Die Wochenpläne werden den Mitarbeitenden zugeordnet. Dabei werden die Definitionen komplett in den persönlichen Kalender des Mitarbeiters/der Mitarbeiterin übernommen."

📘 **TRANSLATION**:

> "Day plans are created for individual days and then combined into week plans. Week plans are assigned to employees. The definitions are completely transferred to the employee's personal calendar."

---

## 1.2 Personal Calendar

📄 **PAGE 38**

📗 **ORIGINAL**:

> "Es wird eine eigene Tabelle geführt, in der für jede/-n Mitarbeiter/-in die komplette Definition pro Tag gespeichert wird. Das bedeutet, dass es möglich ist, einzelne Tage abzuändern, ohne dafür einen neuen Tagesplan erstellen zu müssen."

📘 **TRANSLATION**:

> "A separate table is maintained in which the complete definition per day is stored for each employee. This means it is possible to modify individual days without having to create a new day plan."

📙 **DERIVED** - Data Model:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DayPlan       │────▶│   WeekPlan      │────▶│   Employee      │
│   (Template)    │     │   (Template)    │     │   (Assignment)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ PersonalCalendar│
                                                │ (Per Employee,  │
                                                │  Per Day Copy)  │
                                                └─────────────────┘
```

---

## 1.3 Day Plan ID Restrictions

📄 **PAGE 37**

📗 **ORIGINAL**:

> "Prinzipiell ist die Vergabe der Kennung frei, sie darf lediglich nicht U, K oder S sein – da diese als Kürzel für die Fehltage reserviert sind."

📘 **TRANSLATION**:

> "In principle, the assignment of the ID is free, it just must not be U, K, or S - as these are reserved as codes for absence days."

---

# 2. Tagespläne - Day Plans

📄 **PAGE 38-40**

## 2.1 Day Plan Types

📙 **DERIVED** - From context throughout manual:

| Type                  | German          | Code |
| --------------------- | --------------- | ---- |
| Fixed Working Time    | Festarbeitszeit | FAZ  |
| Flexible Working Time | Gleitzeit       | GLZ  |

---

## 2.2 Core Fields

📙 **DERIVED** - Field list from screenshots and descriptions:

| Field              | German          | Type     | Description                          |
| ------------------ | --------------- | -------- | ------------------------------------ |
| Kennung            | ID              | string   | Unique identifier                    |
| Bezeichnung        | Name            | string   | Description                          |
| Zeitplan-Typ       | Plan Type       | enum     | FAZ or GLZ                           |
| Kommen von         | Arrive from     | time     | Start of arrival window              |
| Kommen bis         | Arrive until    | time     | End of arrival window (GLZ only)     |
| Gehen von          | Leave from      | time     | Start of departure window (GLZ only) |
| Gehen bis          | Leave until     | time     | End of departure window              |
| Regelarbeitszeit 1 | Regular hours 1 | duration | Target daily hours                   |
| Regelarbeitszeit 2 | Regular hours 2 | duration | Alternative for absence days         |
| aktiv              | active          | boolean  | Presence required flag               |

---

# 3. Festarbeitszeit - Fixed Working Time

📄 **PAGE 40**

📗 **ORIGINAL**:

> "Beim Festarbeitszeitplan beginnen die Mitarbeitenden normalerweise immer zu einer bestimmten Uhrzeit und beenden den Arbeitstag in der Regel auch zu einem festen Zeitpunkt."

📘 **TRANSLATION**:

> "With a fixed working time plan, employees normally always start at a specific time and usually end the workday at a fixed point as well."

---

📗 **ORIGINAL**:

> "Es werden hier nur in den Feldern Kommen von und Gehen von Uhrzeiten eingetragen, die anderen beiden Felder sind deaktiviert, sobald im Zeitplan-Typ FAZ – Festarbeitszeit hinterlegt wurde."

📘 **TRANSLATION**:

> "Only the fields 'Kommen von' and 'Gehen von' have times entered here, the other two fields are disabled as soon as FAZ - Fixed Working Time is stored in the plan type."

---

📗 **ORIGINAL**:

> "In der Regelarbeitszeit 1 werden die täglich abzuleistenden Stunden eingetragen, der Haken aktiv wird hier normalerweise gesetzt. Er bedeutet Anwesenheitspflicht."

📘 **TRANSLATION**:

> "In Regelarbeitszeit 1, the daily hours to be worked are entered. The 'aktiv' checkbox is normally set here. It means mandatory presence."

---

📗 **ORIGINAL**:

> "Die Regelarbeitszeit 2 kann gefüllt werden, wenn an diesem Tag eine andere Regelarbeitszeit bei hinterlegten Fehltagen gültig sein soll."

📘 **TRANSLATION**:

> "Regelarbeitszeit 2 can be filled if a different regular working time should be valid on this day for stored absence days."

---

📗 **ORIGINAL**:

> "Der Haken Aus Personalstamm holen wird gesetzt, wenn ZMI Time die Regelarbeitszeit aus dem Personalstamm holen soll. Dies ist sinnvoll, wenn Mitarbeitende mit unterschiedlichen Sollzeiten nach dem gleichen Tagesplan arbeiten."

📘 **TRANSLATION**:

> "The checkbox 'Aus Personalstamm holen' (Get from employee master) is set when ZMI Time should get the regular working time from the employee master data. This is useful when employees with different target times work according to the same day plan."

---

# 4. Gleitzeit - Flexible Working Time

📄 **PAGE 41**

📗 **ORIGINAL**:

> "Im Gleitzeitplan ist für Kommen und Gehen jeweils ein Zeitfenster definiert, in dem die Mitarbeitenden Kommen bzw. Gehen können."

📘 **TRANSLATION**:

> "In the flextime plan, a time window is defined for arrival and departure in which employees can arrive or leave."

---

📗 **ORIGINAL**:

> "Im obigen Beispiel kann der/die Mitarbeiter/-in zwischen 07:00 Uhr und 09:00 Uhr Kommen und zwischen 15:00 Uhr und 19:00 Uhr Gehen. Im Regelfall liegen die erste Kommt-Buchung und die letzte Geht-Buchung innerhalb der angegebenen Zeiten."

📘 **TRANSLATION**:

> "In the example above, the employee can arrive between 07:00 and 09:00 and leave between 15:00 and 19:00. Normally, the first arrival booking and the last departure booking are within the specified times."

---

📗 **ORIGINAL**:

> "Für den Fall, dass eine der beiden Buchungen nicht im Zeitfenster liegt, handelt es sich um eine Kernzeitverletzung."

📘 **TRANSLATION**:

> "In case one of the two bookings is not within the time window, this is a core time violation."

---

📗 **ORIGINAL**:

> "Außerdem wird über das Zeitfenster definiert, ab bzw. bis wann die Zeit angerechnet wird."

📘 **TRANSLATION**:

> "Additionally, the time window defines from when and until when time is credited."

---

📗 **ORIGINAL**:

> "Im genannten Fall wird erst ab 06:00 Uhr morgens die Zeit angerechnet. D.h. bucht der/die Mitarbeiter/-in vor 06:00 Uhr Kommen, wird die Tages-Ist-Zeit von 06:00 Uhr an gerechnet. Es sei denn, über das Feld Toleranz Kommen minus ist ein weiteres Zeitfenster eingerichtet."

📘 **TRANSLATION**:

> "In the mentioned case, time is only credited from 06:00 in the morning. This means if the employee books arrival before 06:00, the daily actual time is calculated from 06:00. Unless an additional time window is set up via the 'Toleranz Kommen minus' field."

📙 **DERIVED** - Time Crediting Logic:

```
if (bookingTime < KommenVon) {
    if (ToleranzKommenMinus > 0) {
        creditFrom = KommenVon - ToleranzKommenMinus
        if (bookingTime < creditFrom) {
            adjustedTime = creditFrom
        } else {
            adjustedTime = bookingTime
        }
    } else {
        adjustedTime = KommenVon  // Time before window not credited
    }
    markCoreTimeViolation()
}
```

---

# 5. Pausen - Breaks

📄 **PAGE 42**

## 5.1 Break Types Overview

📗 **ORIGINAL**:

> "Es können verschiedene Pausenarten definiert werden:"

📘 **TRANSLATION**:

> "Different break types can be defined:"

---

## 5.2 Pause 1 (fest) - Fixed Break 1

📗 **ORIGINAL**:

> "Pause 1 (fest)
> Bei dieser Pause wird die angegebene Uhrzeit als Pause berechnet unabhängig davon, ob der/die Mitarbeiter/-in Pause gebucht hat oder nicht."

📘 **TRANSLATION**:

> "Pause 1 (fixed)
> With this break, the specified time is calculated as a break regardless of whether the employee booked a break or not."

---

## 5.3 Pause 2 (fest) - Fixed Break 2

📗 **ORIGINAL**:

> "Pause 2 (fest)
> Gleiche Pausenart wie Pause 1. Wird üblicherweise für eine Mittagspause herangezogen."

📘 **TRANSLATION**:

> "Pause 2 (fixed)
> Same break type as Pause 1. Usually used for a lunch break."

---

## 5.4 Pause 3 (fest) - Fixed Break 3

📗 **ORIGINAL**:

> "Pause 3 (fest)
> Gleiche Pausenart wie Pause 1."

📘 **TRANSLATION**:

> "Pause 3 (fixed)
> Same break type as Pause 1."

---

## 5.5 Pause 4 (variabel) - Variable Break

📗 **ORIGINAL**:

> "Pause 4 (variabel)
> Ist vom Prinzip her das Gleiche, wie die ersten beiden Pausen. Sie wird allerdings nicht berechnet, wenn der/die Mitarbeiter/-in an diesem Tag eine Pause gebucht hat. Egal, wie lange diese Pausenbuchung war."

📘 **TRANSLATION**:

> "Pause 4 (variable)
> Is in principle the same as the first two breaks. However, it is NOT calculated if the employee booked a break on this day. Regardless of how long that break booking was."

📙 **DERIVED** - Variable Break Logic:

```
if (recordedBreakTime == 0) {
    // No manual break booked -> apply variable break
    deductVariableBreak()
} else {
    // Any manual break exists -> skip variable break entirely
    skipVariableBreak()
}
```

---

## 5.6 Mindestpause 1 nach - Minimum Break 1 After

📗 **ORIGINAL**:

> "Mindestpause 1 nach
> Bei dieser Pause handelt es sich um eine Pause nach Anwesenheitszeit. Wenn der/die Mitarbeiter/-in länger als die hier hinterlegte Zeit anwesend war, berechnet ZMI Time den Wert, der im zweiten Feld eingetragen wurde."

📘 **TRANSLATION**:

> "Minimum break 1 after
> This break is a break based on presence time. If the employee was present longer than the time stored here, ZMI Time calculates the value entered in the second field."

---

## 5.7 Mindestpause 2 nach - Minimum Break 2 After

📗 **ORIGINAL**:

> "Mindestpause 2 nach
> Bei dieser Pause handelt es sich auch um eine Pause nach Anwesenheitszeit. Wenn der/die Mitarbeiter/-in länger als die hier hinterlegte Zeit anwesend war, berechnet ZMI Time den Wert, der im zweiten Feld eingetragen wurde."

📘 **TRANSLATION**:

> "Minimum break 2 after
> This break is also a break based on presence time. If the employee was present longer than the time stored here, ZMI Time calculates the value entered in the second field."

---

## 5.8 Minuten Differenz - Minutes Difference (CRITICAL)

📗 **ORIGINAL**:

> "Der Haken Minuten Differenz (gilt für beide Mindestpausen!) bedeutet anhand eines Beispiels:
> Es wurde eine Mindestpause nach 05:00 Stunden, von 30 Minuten, eingetragen und der Haken wurde gesetzt. War der/die Mitarbeiter/-in 05:10 anwesend, werden ihm nur 10 Minuten Pause abgezogen. Erst, wenn er länger als 05:30 Stunden anwesend war, wird die komplette Pause berechnet. Ohne Haken würde er auch hier die volle halbe Stunde abgezogen bekommen."

📘 **TRANSLATION**:

> "The checkbox 'Minuten Differenz' (applies to both minimum breaks!) means, using an example:
> A minimum break after 05:00 hours, of 30 minutes, was entered and the checkbox was set. If the employee was present for 05:10, only 10 minutes of break are deducted. Only when present longer than 05:30 hours, the complete break is calculated. Without the checkbox, the full half hour would be deducted even here."

📙 **DERIVED** - Minuten Differenz Logic:

```
threshold = 300  // 5 hours in minutes
duration = 30    // break duration
workTime = 310   // 5h 10min in minutes

if (workTime < threshold) {
    deduction = 0  // Below threshold, no break
} else if (MinutesDifference == true) {
    overtime = workTime - threshold  // 310 - 300 = 10
    deduction = min(overtime, duration)  // min(10, 30) = 10
} else {
    deduction = duration  // Always full 30 minutes
}
```

📙 **DERIVED** - Complete Example Table:

| Work Time  | Threshold  | Duration | MinutesDiff | Deduction   |
| ---------- | ---------- | -------- | ----------- | ----------- |
| 4:50 (290) | 5:00 (300) | 30       | true        | 0           |
| 5:00 (300) | 5:00 (300) | 30       | true        | 0           |
| 5:10 (310) | 5:00 (300) | 30       | true        | 10          |
| 5:20 (320) | 5:00 (300) | 30       | true        | 20          |
| 5:30 (330) | 5:00 (300) | 30       | true        | 30          |
| 6:00 (360) | 5:00 (300) | 30       | true        | 30 (capped) |
| 5:10 (310) | 5:00 (300) | 30       | false       | 30          |

---

## 5.9 Break Type Summary

📙 **DERIVED** - Complete Break Behavior Matrix:

| Type               | German    | When Applied                   | Manual Break Effect | Time Window          |
| ------------------ | --------- | ------------------------------ | ------------------- | -------------------- |
| Pause 1-3 (fest)   | Fixed     | Always if work overlaps window | Ignored             | Yes                  |
| Pause 4 (variabel) | Variable  | Only if no manual break        | Skipped entirely    | Yes                  |
| Mindestpause 1     | Minimum 1 | After threshold                | Additive            | No (threshold-based) |
| Mindestpause 2     | Minimum 2 | After threshold                | Additive            | No (threshold-based) |

---

# 6. Toleranz - Tolerance

📄 **PAGE 43-44**

## 6.1 Gleitzeit Tolerance

📗 **ORIGINAL**:

> "Bei einem Gleitzeitplan besteht mit der Toleranz die Möglichkeit, Buchungen um die eingestellten Uhrzeiten um Kommen von und Gehen bis nach vorne oder hinten zu öffnen. Die Angabe der Zeiten erfolgt in Minuten."

📘 **TRANSLATION**:

> "With a flextime plan, tolerance provides the possibility to open bookings around the set times for 'Kommen von' and 'Gehen bis' forwards or backwards. The times are specified in minutes."

---

📗 **ORIGINAL**:

> "Das Beispiel würde bei dem oben genannten Gleitzeitplan die Buchungen ab 05:00 Uhr anrechnen. Allerdings wird der Tag mit Kernzeitverletzung markiert."

📘 **TRANSLATION**:

> "The example would credit bookings from 05:00 for the flextime plan mentioned above. However, the day is marked with a core time violation."

---

## 6.2 Gleitzeit Tolerance Limitation

📗 **ORIGINAL**:

> "Hinweis: Die Felder Toleranz Kommen +, Toleranz Gehen - und variable Arbeitszeit haben beim Gleitzeitplan keine Bedeutung."

📘 **TRANSLATION**:

> "Note: The fields 'Toleranz Kommen +', 'Toleranz Gehen -', and 'variable Arbeitszeit' have no meaning for flextime plans."

📙 **DERIVED** - Tolerance Field Usage:

| Field                | Festarbeitszeit               | Gleitzeit |
| -------------------- | ----------------------------- | --------- |
| Toleranz Kommen -    | Yes (if variable Arbeitszeit) | Yes       |
| Toleranz Kommen +    | Yes                           | **No**    |
| Toleranz Gehen -     | Yes                           | **No**    |
| Toleranz Gehen +     | Yes                           | Yes       |
| variable Arbeitszeit | Enables Toleranz Kommen -     | **No**    |

---

## 6.3 Festarbeitszeit Tolerance Example

📄 **PAGE 43-44**

📗 **ORIGINAL**:

> "Für einen Festarbeitszeitplan, bei dem von 7:00 Uhr bis 16:00 Uhr eingestellt ist, würde nachfolgende Einstellung folgendes bedeuten:"

📘 **TRANSLATION**:

> "For a fixed working time plan set from 7:00 to 16:00, the following settings would mean:"

---

📗 **ORIGINAL**:

> "Vor 7:00 Uhr wird die Kommt-Buchung in 30 Minuten-Schritten gerastert. Das heißt, es wird immer auf die volle halbe Stunde aufgerundet, bis 07:00 Uhr."

📘 **TRANSLATION**:

> "Before 7:00, the arrival booking is gridded in 30-minute steps. This means it is always rounded up to the full half hour, until 07:00."

---

📗 **ORIGINAL**:

> "Bis 2 Minuten nach 07:00 Uhr wird die Buchung auf 07:00 Uhr abgerundet. Wenn der/die Mitarbeiter/-in also 2 Minuten zu spät gekommen ist, wird dieses noch toleriert."

📘 **TRANSLATION**:

> "Up to 2 minutes after 07:00, the booking is rounded down to 07:00. So if the employee arrived 2 minutes late, this is still tolerated."

---

📗 **ORIGINAL**:

> "Um 16:00 Uhr verhält es sich fast genauso:
> Geht der/die Mitarbeiter/-in 2 Minuten zu früh, wird die Buchung auf 16:00 Uhr aufgerundet."

📘 **TRANSLATION**:

> "At 16:00 it behaves almost the same:
> If the employee leaves 2 minutes early, the booking is rounded up to 16:00."

---

📗 **ORIGINAL**:

> "Zwischen 16:00 Uhr und 16:15 Uhr wird die Buchung auf 16:00 Uhr abgerundet. Nach 16:15 Uhr wird die Buchung in Abhängigkeit vom Abgleich bewertet."

📘 **TRANSLATION**:

> "Between 16:00 and 16:15, the booking is rounded down to 16:00. After 16:15, the booking is evaluated according to the rounding rules (Abgleich)."

---

📗 **ORIGINAL**:

> "Die Toleranz Kommen (-) wird nur dann berücksichtigt, wenn der Haken variable Arbeitszeit gesetzt wurde."

📘 **TRANSLATION**:

> "The 'Toleranz Kommen (-)' is only considered when the checkbox 'variable Arbeitszeit' is set."

---

📙 **DERIVED** - Festarbeitszeit Tolerance Logic:

```
Example: FAZ 07:00-16:00
         Toleranz Kommen -: 30 (rounding interval before start)
         Toleranz Kommen +: 2  (grace period after start)
         Toleranz Gehen -:  2  (grace period before end)
         Toleranz Gehen +:  15 (no-overtime zone after end)

ARRIVAL (Kommen):
├── Before 06:30: Rounded UP in 30-min steps to earliest 06:30
├── 06:30-07:00: Rounded UP in 30-min steps (06:35→07:00, 06:31→07:00)
├── 07:00-07:02: Rounded DOWN to 07:00 (grace period)
└── After 07:02: Apply Abgleich rounding rules

DEPARTURE (Gehen):
├── Before 15:58: No adjustment (leaving early - undertime)
├── 15:58-16:00: Rounded UP to 16:00 (grace period)
├── 16:00-16:15: Rounded DOWN to 16:00 (no overtime credited)
└── After 16:15: Apply Abgleich rounding rules
```

---

# 7. Abgleich - Rounding

📄 **PAGE 44-45**

## 7.1 Overview

📗 **ORIGINAL**:

> "Der Abgleich betrifft die einzelnen Buchungen. Sie können hier gerastert werden. Normalerweise wird diese Funktion genutzt, wenn die Buchungen nicht minutengenau, sondern auf 5, 10 oder 15 Minuten gerundet werden sollen. Es kann aber auch jeder andere beliebige Wert eingestellt werden."

📘 **TRANSLATION**:

> "Rounding concerns the individual bookings. They can be gridded here. Normally this function is used when bookings should not be to the minute, but rounded to 5, 10, or 15 minutes. However, any other arbitrary value can also be set."

---

## 7.2 Aufrunden - Round Up

📗 **ORIGINAL**:

> "Aufrunden
> Die Buchung wird immer auf den nächsten Wert aufgerundet, der in der Rasterung kommt.
> Zum Beispiel bei 15 Minuten aufrunden:
> 06:03 wird 06:15, 07:35 wird 07:45, 07:30 bleibt 07:30
> Üblicherweise wird diese Art der Rundung bei Kommt-Buchungen angewendet."

📘 **TRANSLATION**:

> "Round up
> The booking is always rounded up to the next value in the grid.
> For example, with 15 minutes round up:
> 06:03 becomes 06:15, 07:35 becomes 07:45, 07:30 stays 07:30
> Usually this type of rounding is applied to arrival bookings."

📙 **DERIVED** - Round Up Formula:

```
func roundUp(time, interval int) int {
    if time % interval == 0 {
        return time
    }
    return ((time / interval) + 1) * interval
}
```

---

## 7.3 Abrunden - Round Down

📗 **ORIGINAL**:

> "Abrunden
> Die Buchung wird immer auf den nächsten Wert abgerundet, der in der Rasterung kommt.
> Zum Beispiel bei 10 Minuten abrunden:
> 15:03 wird 15:00, 16:18 wird 16:10
> Normale Anwendung bei den Geht-Buchungen."

📘 **TRANSLATION**:

> "Round down
> The booking is always rounded down to the next value in the grid.
> For example, with 10 minutes round down:
> 15:03 becomes 15:00, 16:18 becomes 16:10
> Normal application for departure bookings."

📙 **DERIVED** - Round Down Formula:

```
func roundDown(time, interval int) int {
    return (time / interval) * interval
}
```

---

## 7.4 Mathematisch Runden - Mathematical Rounding

📗 **ORIGINAL**:

> "Mathematisch Runden
> Die Buchung wird auf Basis der Rasterung gerundet. Die Rundung an sich geschieht wie in der Mathematik üblich.
> Zum Beispiel bei 5 Minuten mathematisch Runden: 15:02 wird 15:00, 15:03 wird 15:05"

📘 **TRANSLATION**:

> "Mathematical rounding
> The booking is rounded based on the grid. The rounding itself happens as usual in mathematics.
> For example, with 5 minutes mathematical rounding: 15:02 becomes 15:00, 15:03 becomes 15:05"

📙 **DERIVED** - Mathematical Rounding Formula:

```
func roundMath(time, interval int) int {
    remainder := time % interval
    if remainder >= interval / 2 {
        return ((time / interval) + 1) * interval
    }
    return (time / interval) * interval
}

// Note: 15:02 with 5-min interval
// 15:02 = 902 minutes, 902 % 5 = 2, 2 < 2.5 → round down to 900 (15:00)
// 15:03 = 903 minutes, 903 % 5 = 3, 3 >= 2.5 → round up to 905 (15:05)
```

---

## 7.5 Wert addieren / subtrahieren - Add / Subtract Value

📗 **ORIGINAL**:

> "Wert addieren und Wert subtrahieren
> Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert.
> Zum Beispiel bei 10 Minuten addieren: 05:55 wird 06:05, 07:32 wird 07:42
> Diese Einstellung wird benötigt, wenn die Mitarbeitenden einen langen Weg vom Zeiterfassungsterminal zu ihrem Arbeitsplatz haben oder nach der Schicht noch duschen müssen und diese Zeit soll nicht berücksichtigt werden."

📘 **TRANSLATION**:

> "Add value and subtract value
> With this setting, the set value is added to or subtracted from the booking.
> For example, adding 10 minutes: 05:55 becomes 06:05, 07:32 becomes 07:42
> This setting is needed when employees have a long way from the time recording terminal to their workplace or need to shower after their shift and this time should not be considered."

📙 **DERIVED** - Add/Subtract Formula:

```
func addValue(time, value int) int {
    return time + value
}

func subtractValue(time, value int) int {
    return time - value
}
```

---

## 7.6 Alle Buchungen runden - Round All Bookings

📗 **ORIGINAL**:

> "Alle Buchungen runden
> Standardmäßig ist diese Funktion deaktiviert: Dann wird lediglich die erste Kommt-Buchung und die letzte Geht-Buchung gerundet.
> Wenn der Haken aktiviert ist, werden alle Kommen- und Gehen-Buchungen gerundet."

📘 **TRANSLATION**:

> "Round all bookings
> By default, this function is disabled: Then only the first arrival booking and the last departure booking are rounded.
> If the checkbox is activated, ALL arrival and departure bookings are rounded."

📙 **DERIVED** - Rounding Scope:

```
if (AlleBuchungenRunden == false) {
    // DEFAULT: Only round first IN and last OUT
    round(firstArrivalBooking)
    round(lastDepartureBooking)
} else {
    // Round ALL bookings
    for each booking {
        round(booking)
    }
}
```

---

## 7.7 Rounding Type Summary

📙 **DERIVED** - Complete Rounding Types:

| Type           | German            | Typical Use            | Example (15 min)             |
| -------------- | ----------------- | ---------------------- | ---------------------------- |
| Round Up       | Aufrunden         | Arrivals               | 06:03 → 06:15                |
| Round Down     | Abrunden          | Departures             | 16:18 → 16:15                |
| Mathematical   | Mathematisch      | Either                 | 06:07 → 06:00, 06:08 → 06:15 |
| Add Value      | Wert addieren     | Walk time compensation | 06:00 + 10 → 06:10           |
| Subtract Value | Wert subtrahieren | Shower time deduction  | 16:00 - 10 → 15:50           |

---

# 7.8 Abgleich relativ zur Kommt-/Gehtzeit

📄 **PAGE 4680 (System Settings - Optionen)**

📗 **ORIGINAL**:

> "Abgleich relativ zur im Zeitplan hinterlegten Komm-/Gehtzeit runden:
> Bei Aktivieren dieser Option werden die Rundungsregeln nochmals beeinflusst. Ein Beispiel soll dies deutlich machen:
> Im Zeitplan ist als Rundungsregel bei Kommt hinterlegt: Aufrunden auf 15 Minuten
> Option Abgleich relativ ... nicht aktiviert:
> Arbeitsbeginn lt. Tagesplan: 8:10 Uhr
> Mitarbeiter/-in kommt um 8:11 Uhr, seine Kommt-Zeit wird auf 8:15 Uhr aufgerundet
> Mitarbeiter/-in kommt um 8:16 Uhr, seine Kommt-Zeit wird auf 8:30 Uhr aufgerundet
> Option Abgleich relativ ... aktiviert:
> Arbeitsbeginn lt. Tagesplan: 8:10 Uhr
> Mitarbeiter/-in kommt um 8:11 Uhr, seine Kommt-Zeit wird auf 8:25 Uhr aufgerundet
> Mitarbeiter/-in kommt um 8:16 Uhr, seine Kommt-Zeit wird auf 8:25 Uhr aufgerundet"

📘 **TRANSLATION**:

> "Round relative to the arrival/departure time stored in the day plan:
> When this option is enabled, the rounding rules are influenced again. An example makes this clear:
> In the day plan, the rounding rule for arrival is set: round up to 15 minutes
> Option not activated:
> Planned work start: 8:10
> Employee arrives at 8:11, arrival is rounded up to 8:15
> Employee arrives at 8:16, arrival is rounded up to 8:30
> Option activated:
> Planned work start: 8:10
> Employee arrives at 8:11, arrival is rounded up to 8:25
> Employee arrives at 8:16, arrival is rounded up to 8:25"

📙 **DERIVED**:

```
if (RoundRelativeToPlanStart) {
    // Rounding grid is anchored at planned start time (Kommen von/Gehen von)
} else {
    // Rounding grid is anchored at absolute clock (00:00)
}
```

---

# 8. Sonderfunktionen - Special Functions

📄 **PAGE 46-47**

## 8.1 Zeitgutschrift an Feiertagen - Holiday Time Credit

📗 **ORIGINAL**:

> "In Zeitgutschrift an Feiertagen stellen Sie ein, welche Zeit das Programm an Feiertagen gutschreiben soll. Hier findet man auch wieder die drei möglichen Kategorien, die im Mandantenstamm bei den Feiertagen definiert wurden.
> Üblicherweise ist Kategorie 1 der ganze Feiertag und Kategorie 2 der halbe Feiertag.
> Sie übernehmen hier also einmal die Regelarbeitszeit, die im Zeitplan definiert wurde, in die Kategorie 1 und schreiben die Hälfte davon in die Kategorie 2."

📘 **TRANSLATION**:

> "In 'Zeitgutschrift an Feiertagen' (Holiday time credit), you set which time the program should credit on holidays. Here you also find the three possible categories defined in the client master data for holidays.
> Usually Category 1 is the full holiday and Category 2 is the half holiday.
> So you take the regular working time defined in the time plan for Category 1 and write half of it in Category 2."

📙 **DERIVED** - Holiday Credit Configuration:

```
DayPlan.HolidayCredit = {
    Category1: Regelarbeitszeit,      // e.g., 8:00
    Category2: Regelarbeitszeit / 2,  // e.g., 4:00
    Category3: custom_value
}
```

---

## 8.2 Urlaubsbewertung - Vacation Valuation

📗 **ORIGINAL**:

> "In Urlaubsbewertung tragen Sie den Wert ein, den das Programm bei einem hinterlegten Urlaubstag vom Resturlaubskonto abziehen soll. Hier steht normalerweise eine 1, damit ein Tag abgezogen wird. Alternativ kann hier auch ein Stundenwert eingetragen werden, wenn der Urlaub in Stunden geführt werden soll."

📘 **TRANSLATION**:

> "In 'Urlaubsbewertung' (Vacation valuation), you enter the value that the program should deduct from the remaining vacation account for a stored vacation day. Normally this is 1, so that one day is deducted. Alternatively, an hour value can be entered here if vacation is to be tracked in hours."

📙 **DERIVED**:

```
DayPlan.VacationDeduction = 1      // Deduct 1 day
// OR
DayPlan.VacationDeduction = 8.0    // Deduct 8 hours (if tracking in hours)
```

---

## 8.3 Tage ohne Buchungen - Days Without Bookings

📗 **ORIGINAL**:

> "Bei Tage ohne Buchungen definieren Sie, was passieren soll, wenn der/die Mitarbeiter/-in keine Buchung macht. Folgende Varianten können Sie hinterlegen:
>
> Keine Bewertung:
> Es wird nichts berechnet, der Tag wird im Korrekturassistenten als fehlerhaft angezeigt.
>
> Sollstunden abziehen:
> Es werden automatisch die hinterlegten Sollstunden abgezogen, es erfolgt kein Hinweis im Korrekturassistenten.
>
> Berufsschultag:
> Es wird automatisch ein Berufsschultag eingetragen, falls für Tage in der Vergangenheit keine Buchungen vorhanden sind bzw. kein anderer Fehltag eingetragen ist. Somit wird kein Eintrag im Korrekturassistent erzeugt.
>
> Sollstunden übernehmen:
> Es wird automatisch die hinterlegte Sollzeit als Anwesenheitszeit gebucht.
>
> Sollstunden mit Stammauftrag:
> Es wird bei dem/der Mitarbeiter/-in, mit im Personalstamm hinterlegtem Stammauftrag, automatisch die Tages-Istzeit, laut gültigem Zeitplan, als Auftragszeit und auch als Tages-Istzeit gebucht."

📘 **TRANSLATION**:

> "For 'Days without bookings', you define what should happen when the employee makes no booking. The following variants can be stored:
>
> No evaluation:
> Nothing is calculated, the day is shown as erroneous in the correction assistant.
>
> Deduct target hours:
> The stored target hours are automatically deducted, there is no notification in the correction assistant.
>
> Vocational school day:
> A vocational school day is automatically entered if no bookings exist for days in the past and no other absence day is entered. Thus no entry is created in the correction assistant.
>
> Adopt target hours:
> The stored target time is automatically booked as presence time.
>
> Target hours with default order:
> For the employee with a default order stored in the employee master, the daily actual time according to the valid time plan is automatically booked as order time and also as daily actual time."

📙 **DERIVED** - NoBookingBehavior Enum:

```
type NoBookingBehavior int

const (
    NoBookingNoEvaluation       NoBookingBehavior = iota  // Error in correction assistant
    NoBookingDeductTargetHours                             // Subtract Regelarbeitszeit
    NoBookingVocationalSchool                              // Auto-insert vocational school absence
    NoBookingAdoptTargetHours                              // Credit Regelarbeitszeit as work
    NoBookingTargetWithOrder                               // Credit to default project (ZMI Auftrag)
)
```

---

## 8.4 Tageswechsel - Day Change

📄 **PAGE 47**

📗 **ORIGINAL**:

> "Bei Tageswechsel definieren Sie, wie die Bewertung der gebuchten Zeiten beim Tageswechsel erfolgen soll. Folgende Varianten sind möglich:
>
> Kein Tageswechsel:
> Ist die Standardeinstellung, wenn die Mitarbeitenden nicht über 00:00 Uhr hinaus arbeiten.
>
> Bewertung bei Kommen:
> Die Bewertung der Tagesarbeitszeit erfolgt auf den Tag der Kommt-Buchung.
>
> Bewertung bei Gehen:
> Die Bewertung der Tagesarbeitszeit erfolgt auf den Tag der Geht-Buchung.
>
> Automatisch vervollständigen:
> Es wird automatisch eine Geht-Buchung um 00:00 Uhr am ersten Tag, und eine Kommt-Buchung um 00:00 Uhr für den nächsten Tag, mit der Funktion Tag berechnen, eingefügt."

📘 **TRANSLATION**:

> "For 'Day change', you define how the evaluation of booked times should occur at day change. The following variants are possible:
>
> No day change:
> Is the default setting when employees do not work past 00:00.
>
> Evaluate at arrival:
> The evaluation of daily work time occurs on the day of the arrival booking.
>
> Evaluate at departure:
> The evaluation of daily work time occurs on the day of the departure booking.
>
> Auto-complete:
> A departure booking at 00:00 on the first day, and an arrival booking at 00:00 for the next day, is automatically inserted with the 'Calculate day' function."

---

📗 **ORIGINAL** (Example):

> "Beispiel:
> Kommt-Buchung am 23.03. um 20:00 Uhr, Geht-Buchung am 24.03. um 07:00 Uhr:
> Am 24.03. erfolgt bei Tag berechnen (i.d.R. automatisch als Termin im ZMI Server) das Auffüllen der Zeit vom 23.03. auf 00:00 Uhr.
> Erst am 25.03. erfolgt dann bei Tag berechnen das Auffüllen der Buchung vom 24.03. (00:00 Uhr bis 07:00 Uhr)."

📘 **TRANSLATION**:

> "Example:
> Arrival booking on 23.03 at 20:00, departure booking on 24.03 at 07:00:
> On 24.03 when calculating the day (usually automatically as a scheduled task in ZMI Server), the time from 23.03 is filled up to 00:00.
> Only on 25.03 does the calculation then fill the booking from 24.03 (00:00 to 07:00)."

📙 **DERIVED** - Auto-Complete Logic:

```
// Original bookings:
// Day 1 (23.03): IN 20:00
// Day 2 (24.03): OUT 07:00

// After auto-complete on Day 2 calculation:
// Day 1 (23.03): IN 20:00, OUT 00:00 (auto-inserted)
// Day 2 (24.03): (waiting for next day calculation)

// After auto-complete on Day 3 calculation:
// Day 1 (23.03): IN 20:00, OUT 00:00 → 4 hours
// Day 2 (24.03): IN 00:00 (auto-inserted), OUT 07:00 → 7 hours
```

📙 **DERIVED** - DayChangeBehavior Enum:

```
type DayChangeBehavior int

const (
    DayChangeNone        DayChangeBehavior = iota  // No overnight work
    DayChangeAtArrival                              // Credit to arrival day
    DayChangeAtDeparture                            // Credit to departure day
    DayChangeAutoComplete                           // Split at midnight
)
```

---

## 8.5 Max. Netto-Arbeitszeit - Maximum Net Work Time

📄 **PAGE 50**

📗 **ORIGINAL**:

> "Wenn im Feld Max. Netto-Arbeitszeit ein Wert eingetragen ist, z.B. 10 Stunden, ist die Tagessumme entsprechend begrenzt. Arbeitet der/die Mitarbeiter/-in länger, werden die Stunden, die über dem Wert liegen, gekappt."

📘 **TRANSLATION**:

> "If a value is entered in the 'Max. Netto-Arbeitszeit' (Maximum net work time) field, e.g., 10 hours, the daily total is limited accordingly. If the employee works longer, the hours above the value are capped."

📙 **DERIVED**:

```
if (MaxNetWorkTime > 0 && netTime > MaxNetWorkTime) {
    cappedTime = netTime - MaxNetWorkTime
    netTime = MaxNetWorkTime
    // cappedTime goes to Kappungskonto if configured
}
```

---

## 8.6 Kappungskonto - Capping Account

📄 **PAGE 49-50**

📗 **ORIGINAL**:

> "Das Kappungskonto zählt die Zeit, die dem/der Mitarbeiter/-in abgeschnitten wurde, wenn er/sie vor dem Bewertungsrahmen eines Tages kommt.
>
> Beispiel:
> Im Tagesplan wurde bei Kommen von 07:00 Uhr eingestellt, der/die Mitarbeiter/-in kommt aber um 6:45 Uhr, dann stehen auf diesem Konto 15 Minuten."

📘 **TRANSLATION**:

> "The capping account counts the time that was cut off from the employee when they arrive before the evaluation frame of a day.
>
> Example:
> In the day plan, 'Kommen von' was set to 07:00, but the employee arrives at 6:45, then 15 minutes are on this account."

---

# 9. Zuschläge - Surcharges

📄 **PAGE 48**

## 9.1 Overview

📗 **ORIGINAL**:

> "Im Bereich Zuschläge können Konten hinterlegt werden, die zu bestimmten Uhrzeiten gefüllt werden."

📘 **TRANSLATION**:

> "In the surcharges section, accounts can be stored that are filled at certain times."

---

## 9.2 Surcharge Rules

📗 **ORIGINAL**:

> "Auswirkung:
> Der Feiertagszuschlag gilt für den ganzen Tag, wenn es sich um einen Feiertag der Kategorie 1 oder 2 handelt. Von 22:00 Uhr bis 06:00 Uhr wird ein Nachtzuschlag bezahlt. Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig."

📘 **TRANSLATION**:

> "Effect:
> The holiday surcharge applies for the whole day if it is a holiday of Category 1 or 2. From 22:00 to 06:00, a night surcharge is paid. However, this surcharge is only valid on a normal workday and not on a holiday."

---

## 9.3 Critical Time Split Rule

📗 **ORIGINAL**:

> "Hinweis: Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden. Ein Eintrag von 22:00 Uhr bis 06:00 Uhr ist ungültig."

📘 **TRANSLATION**:

> "Note: Surcharges must be entered ending at 00:00 or starting at 00:00. An entry from 22:00 to 06:00 is INVALID."

📙 **DERIVED** - Correct Surcharge Configuration:

```
// WRONG:
Surcharge{ Start: 22:00, End: 06:00 }  // INVALID!

// CORRECT:
Surcharge{ Start: 22:00, End: 00:00 }  // Evening portion
Surcharge{ Start: 00:00, End: 06:00 }  // Morning portion
```

📙 **DERIVED** - Surcharge Calculation:

```
type SurchargeConfig struct {
    Account     string    // Target account
    StartTime   int       // Minutes from midnight
    EndTime     int       // Minutes from midnight (max 1440)
    DayTypes    []DayType // Workday, Holiday Cat 1, Holiday Cat 2, etc.
}

// EndTime must be > StartTime (no overnight spans)
// For overnight: create two surcharges split at midnight
```

---

# 10. Schichterkennung - Shift Detection

📄 **PAGE 48-49**

## 10.1 Overview

📗 **ORIGINAL**:

> "Unter diesem Karteireiter kann eine automatische Schichterkennung auf Basis der Zeitbuchungen realisiert werden."

📘 **TRANSLATION**:

> "Under this tab, automatic shift detection based on time bookings can be realized."

---

## 10.2 Arrival-Based Detection

📗 **ORIGINAL**:

> "Automatische Schichterkennung Kommen:
> Wenn hier in von und bis eine Uhrzeit eingetragen wird, prüft das Programm, ob die Kommt-Buchung in diesem Bereich liegt.
> Wenn ja, ist der aktuelle Tagesplan gültig. Wenn nicht, sucht ZMI Time in den alternativen Tagesplänen, ob ein passender Tagesplan zugewiesen ist."

📘 **TRANSLATION**:

> "Automatic shift detection arrival:
> If a time is entered here in 'von' and 'bis', the program checks if the arrival booking is within this range.
> If yes, the current day plan is valid. If not, ZMI Time searches the alternative day plans to see if a matching day plan is assigned."

---

## 10.3 Departure-Based Detection

📗 **ORIGINAL**:

> "Automatische Schichterkennung Gehen:
> Verhält sich genauso wie bei Kommen, nur wird hier die Geht-Buchung geprüft."

📘 **TRANSLATION**:

> "Automatic shift detection departure:
> Behaves the same as for arrival, only here the departure booking is checked."

---

📗 **ORIGINAL**:

> "Es ist möglich, in einem Tagesplan auch beide Buchungen zu prüfen."

📘 **TRANSLATION**:

> "It is possible to check both bookings in one day plan."

---

## 10.4 Alternative Day Plans

📗 **ORIGINAL**:

> "Alternative Tagespläne:
> Es können bis zu sechs verschiedene Tagespläne als Alternativen hinterlegt werden, indem man deren Tagesplankürzel einträgt."

📘 **TRANSLATION**:

> "Alternative day plans:
> Up to six different day plans can be stored as alternatives by entering their day plan codes."

---

## 10.5 No Match Found

📗 **ORIGINAL**:

> "Für den Fall, dass kein passender Tagesplan gefunden wird, erzeugt ZMI Time eine Meldung im Korrekturassistent: «Kein passender Zeitplan gefunden»."

📘 **TRANSLATION**:

> "In case no matching day plan is found, ZMI Time generates a message in the correction assistant: 'No matching time plan found'."

📙 **DERIVED** - Shift Detection Logic:

```
func detectShift(booking BookingInput, dayPlan DayPlan) DayPlan {
    // Check arrival window
    if dayPlan.ShiftDetection.ArrivalEnabled {
        if booking.Direction == DirectionIn {
            if booking.Time >= dayPlan.ShiftDetection.ArrivalFrom &&
               booking.Time <= dayPlan.ShiftDetection.ArrivalTo {
                return dayPlan  // Current plan matches
            }
        }
    }

    // Check departure window
    if dayPlan.ShiftDetection.DepartureEnabled {
        if booking.Direction == DirectionOut {
            if booking.Time >= dayPlan.ShiftDetection.DepartureFrom &&
               booking.Time <= dayPlan.ShiftDetection.DepartureTo {
                return dayPlan
            }
        }
    }

    // Search alternatives
    for _, altPlanID := range dayPlan.ShiftDetection.Alternatives {
        altPlan := loadDayPlan(altPlanID)
        if matchesShiftWindow(booking, altPlan) {
            return altPlan
        }
    }

    // No match
    createCorrectionError("Kein passender Zeitplan gefunden")
    return dayPlan  // Keep original
}
```

---

# 11. Wochenpläne - Week Plans

📄 **PAGE 56-57**

## 11.1 Overview

📗 **ORIGINAL**:

> "Wenn die notwendigen Tagespläne festgelegt sind, können die Wochenpläne definiert werden."

📘 **TRANSLATION**:

> "Once the necessary day plans are defined, the week plans can be defined."

---

📗 **ORIGINAL**:

> "Nachdem Tagespläne zu Wochenplänen zusammengefasst sind, können diese den Mitarbeitenden im Personalstamm zugewiesen werden. Dabei werden die Definitionen komplett in den persönlichen Kalender des Mitarbeiters/der Mitarbeiterin übernommen."

📘 **TRANSLATION**:

> "After day plans are combined into week plans, these can be assigned to employees in the employee master data. The definitions are completely transferred to the employee's personal calendar."

---

## 11.2 Mandatory Day Plan Assignment

📗 **ORIGINAL**:

> "Achtung: Sie müssen für jeden Tag einen eindeutigen Tagesplan hinterlegen. Wenn der/die Mitarbeiter/-in also in der Woche immer an einem bestimmten Tag frei hat, muss hier auch ein richtig definierter Tagesplan hinterlegt sein."

📘 **TRANSLATION**:

> "Attention: You must store a unique day plan for each day. So if the employee always has a free day on a certain day of the week, a properly defined day plan must also be stored here."

📙 **DERIVED** - Week Plan Structure:

```
type WeekPlan struct {
    ID          string
    Name        string
    MandantID   *string   // Optional: restrict to specific client
    Monday      string    // DayPlan ID (required)
    Tuesday     string    // DayPlan ID (required)
    Wednesday   string    // DayPlan ID (required)
    Thursday    string    // DayPlan ID (required)
    Friday      string    // DayPlan ID (required)
    Saturday    string    // DayPlan ID (required)
    Sunday      string    // DayPlan ID (required)
}
```

---

# 12. Monatsbewertung - Monthly Evaluation

📄 **PAGE 59-60**

## 12.1 Overview

📗 **ORIGINAL**:

> "Möglicherweise möchten Sie am Monatsende die jeweiligen Überstunden (Gleitzeitstunden) der Mitarbeitenden bewerten.
>
> Zum Beispiel können Sie definieren, dass auf dem Gleitzeitkonto nur bis zu 30 Stunden angesammelt werden dürfen. Was darüber hinaus geht, soll verfallen (gekappt werden). Oder einige Mitarbeitende bekommen bereits die ersten Überstunden mit dem Monatslohn ausgeglichen. D.h. Sie müssen zunächst über eine gewisse Schwelle kommen, damit die Überstunden angerechnet werden."

📘 **TRANSLATION**:

> "You may want to evaluate the respective overtime (flextime hours) of employees at the end of the month.
>
> For example, you can define that only up to 30 hours may be accumulated in the flextime account. Anything beyond that should be forfeited (capped). Or some employees already get the first overtime hours compensated with the monthly salary. This means you must first exceed a certain threshold for the overtime to be credited."

---

## 12.2 Configuration Fields

📗 **ORIGINAL**:

> "Die Gleitzeitbewertung bietet folgende Möglichkeiten:
>
> Maximale Gleitzeit im Monat:
> Im Monat wird maximal dieser Wert auf das Gleitzeitkonto übertragen.
>
> Obergrenze Jahreszeitkonto:
> Wenn das Jahresgleitzeitkonto über dem eingetragenen Wert liegt, wird als Übertrag für den nachfolgenden Monat der eingetragene Wert übernommen. Der Rest wird gekappt.
>
> Untergrenze Jahreszeitkonto
>
> Gleitzeitschwelle:
> Nur, wenn der/die Mitarbeiter/-in mindestens den eingetragenen Wert im Monat als Mehrarbeit erreicht hat, wird ihm die Mehrarbeit auf das Gleitzeitkonto gutgeschrieben. Sollte dieser Wert nicht erreicht werden, verfällt die Mehrarbeit."

📘 **TRANSLATION**:

> "The flextime evaluation offers the following options:
>
> Maximum flextime in month:
> At most this value is transferred to the flextime account per month.
>
> Upper limit annual time account:
> If the annual flextime account is above the entered value, the entered value is taken as the carryover for the following month. The rest is capped.
>
> Lower limit annual time account
>
> Flextime threshold:
> Only if the employee has achieved at least the entered value as overtime in the month, the overtime is credited to the flextime account. If this value is not reached, the overtime is forfeited."

---

## 12.3 Credit Types

📗 **ORIGINAL**:

> "Art der Gutschrift:
>
> - Keine Bewertung: Der vorhandene Gleitzeitwert wird 1 zu 1 in den nächsten Monat übernommen
> - Gleitzeitübertrag komplett: Die Mehrarbeitsstunden werden in Abhängigkeit von Obergrenze Jahreszeitkonto und Maximale Gleitzeit im Monat gutgeschrieben
> - Gleitzeitübertrag nach Schwelle: Erst wenn die monatliche Mehrarbeit größer als die eingetragene Schwelle ist, werden Stunden gutgeschrieben, auch hier gelten die Grenzen Obergrenze Jahreszeitkonto und Maximale Gleitzeit im Monat.
> - Kein Übertrag: Das Jahreszeitkonto wird am Ende des Monats auf 0 gesetzt, d.h. es werden keine Gleitzeitstunden in den nächsten Monat übertragen."

📘 **TRANSLATION**:

> "Credit type:
>
> - No evaluation: The existing flextime value is transferred 1:1 to the next month
> - Complete flextime carryover: The overtime hours are credited depending on upper limit annual time account and maximum flextime in month
> - Flextime carryover after threshold: Only when the monthly overtime is greater than the entered threshold are hours credited, here too the limits upper limit annual time account and maximum flextime in month apply.
> - No carryover: The annual time account is set to 0 at the end of the month, i.e., no flextime hours are transferred to the next month."

📙 **DERIVED** - Monthly Evaluation Logic:

```
type MonthlyEvaluation struct {
    MaxFlextimePerMonth   *int  // Maximum monthly flextime credit
    UpperLimitAnnual      *int  // Cap for annual account
    LowerLimitAnnual      *int  // Floor for annual account
    FlextimeThreshold     *int  // Minimum overtime to qualify
    CreditType            CreditType
}

type CreditType int
const (
    CreditTypeNoEvaluation    CreditType = iota  // 1:1 transfer
    CreditTypeComplete                            // Full with limits
    CreditTypeAfterThreshold                      // Only above threshold
    CreditTypeNoCarryover                         // Reset to 0
)

func evaluateMonth(overtime int, annualBalance int, config MonthlyEvaluation) int {
    switch config.CreditType {
    case CreditTypeNoEvaluation:
        return annualBalance + overtime  // No changes

    case CreditTypeComplete:
        credit := overtime
        if config.MaxFlextimePerMonth != nil && credit > *config.MaxFlextimePerMonth {
            credit = *config.MaxFlextimePerMonth
        }
        newBalance := annualBalance + credit
        if config.UpperLimitAnnual != nil && newBalance > *config.UpperLimitAnnual {
            newBalance = *config.UpperLimitAnnual
        }
        return newBalance

    case CreditTypeAfterThreshold:
        if config.FlextimeThreshold != nil && overtime < *config.FlextimeThreshold {
            return annualBalance  // Overtime forfeited
        }
        // Same as Complete
        credit := overtime
        if config.MaxFlextimePerMonth != nil && credit > *config.MaxFlextimePerMonth {
            credit = *config.MaxFlextimePerMonth
        }
        newBalance := annualBalance + credit
        if config.UpperLimitAnnual != nil && newBalance > *config.UpperLimitAnnual {
            newBalance = *config.UpperLimitAnnual
        }
        return newBalance

    case CreditTypeNoCarryover:
        return 0
    }
}
```

---

# 13. Personalstamm - Employee Data

📄 **PAGE 66-67**

## 13.1 Required Fields

📗 **ORIGINAL**:

> "Folgende Felder sind Pflichtfelder und müssen ausgefüllt werden: Personalnummer, PIN, Vorname, Nachname und Eintritt."

📘 **TRANSLATION**:

> "The following fields are required and must be filled: Employee number, PIN, First name, Last name, and Entry date."

📙 **DERIVED** - Employee Required Fields:

```
type Employee struct {
    // Required
    Personalnummer  string    // Employee number
    PIN             int       // Personal ID for terminal
    Vorname         string    // First name
    Nachname        string    // Last name
    Eintritt        time.Time // Entry date

    // Optional
    Austritt        *time.Time // Exit date
    // ... more fields
}
```

---

## 13.2 Exit Date Behavior

📄 **PAGE 67**

📗 **ORIGINAL**:

> "Austritt
> Ab dem hinterlegten Datum ist keine Buchung mehr für diese/-n Mitarbeiter/-in möglich."

📘 **TRANSLATION**:

> "Exit
> From the stored date, no booking is possible for this employee anymore."

---

# 14. Tarif - Employment Contract

📄 **PAGE 83-93**

## 14.1 Vacation Values

📄 **PAGE 85**

📗 **ORIGINAL**:

> "Im Feld Jahresurlaub tragen Sie den Jahres-Urlaubsanspruch ein (z.B. 30 Tage).
> Im Feld AT pro Woche hinterlegen Sie die Anzahl der Wochenarbeitstage (z.B. 5). Diese Angaben sind wichtig für die Urlaubsberechnung."

📘 **TRANSLATION**:

> "In the field 'Jahresurlaub' (Annual vacation), enter the annual vacation entitlement (e.g., 30 days).
> In the field 'AT pro Woche' (Work days per week), store the number of weekly work days (e.g., 5). This information is important for vacation calculation."

---

📗 **ORIGINAL**:

> "Hinweis: Es muss im Feld Jahresurlaub immer der Urlaubsanspruch des gesamten Jahres eingegeben werden. Beim Jahreswechsel holt sich ZMI Time diesen Wert und addiert ihn für das neue Jahr."

📘 **TRANSLATION**:

> "Note: The vacation entitlement for the entire year must always be entered in the 'Jahresurlaub' field. At year change, ZMI Time takes this value and adds it for the new year."

---

## 14.2 Target Hours

📄 **PAGE 86-87**

📗 **ORIGINAL** (from context):

> "Tagessollstunden: Wird hier ein Wert eingetragen, kann im Tagesplan, mit Aktivieren der Funktion Aus Personalstamm holen, eine andere Sollzeit für den Tagesplan vorgegeben werden.
> Wochensollstunden: Der eingetragene Wert kann für ein Makro verwendet werden.
> Monatssollstunden: Der eingetragene Wert kann für ein Makro verwendet werden.
> Jahressollstunden: Der eingetragene Wert kann für ein Makro verwendet werden."

📘 **TRANSLATION**:

> "Daily target hours: If a value is entered here, a different target time can be specified for the day plan by activating the 'Get from employee master' function.
> Weekly target hours: The entered value can be used for a macro.
> Monthly target hours: The entered value can be used for a macro.
> Annual target hours: The entered value can be used for a macro."

---

## 14.3 Time Plan Assignment - Weekly

📄 **PAGE 89-92**

📗 **ORIGINAL**:

> "Wenn Sie wöchentlich wählen, können Sie unter Zeitplan dem/der Mitarbeiter/-in einen oder mehrere der zuvor angelegten Wochenpläne zuordnen."

📘 **TRANSLATION**:

> "If you choose 'weekly', you can assign one or more of the previously created week plans to the employee under 'Time plan'."

---

## 14.4 Rolling Week Plans

📄 **PAGE 92**

📗 **ORIGINAL**:

> "Wochenpläne können auch rollierend, d.h. abwechselnd hintereinander, eingetragen werden, z.B. Frühschicht – Spätschicht – Nachtschicht im wöchentlichen Wechsel."

📘 **TRANSLATION**:

> "Week plans can also be entered rolling, i.e., alternating one after another, e.g., early shift - late shift - night shift in weekly rotation."

📙 **DERIVED**:

```
type TimeplanAssignment struct {
    Rhythm      TimeplanRhythm  // Weekly or EveryXDays
    WeekPlans   []string        // Week plan IDs (if multiple: rotating)
    CycleDays   int             // For EveryXDays rhythm
    DayPlans    []string        // Day plan per day in cycle
}

// Example: 3-week rotation
// Week 1: Frühschicht
// Week 2: Spätschicht
// Week 3: Nachtschicht
// Week 4: Frühschicht (repeats)
```

---

## 14.5 Time Plan by X Days

📄 **PAGE 93**

📗 **ORIGINAL**:

> "Wenn Sie das Zeitplan-Modell nach X-Tagen auswählen, geben Sie an, nach wie vielen Tagen sich die Zeitpläne wiederholen sollen."

📘 **TRANSLATION**:

> "If you select the 'Every X days' time plan model, you specify after how many days the time plans should repeat."

---

# 15. Fehltage - Absence Days

📄 **PAGE 159-161**

## 15.1 Absence Type Prefixes

📗 **ORIGINAL** (derived from multiple sections):

> Absence codes must start with:
>
> - U = Urlaub (Vacation)
> - K = Krankheit (Sickness)
> - S = Sondertage (Special days)

📘 **TRANSLATION**:

> Same as above - this is consistent throughout the manual.

---

## 15.2 Anteil - Portion

📄 **PAGE 160**

📗 **ORIGINAL**:

> "Unter Anteil definieren Sie den Anteil der Regelarbeitszeit, der dem/der Mitarbeit-er/-in an einem Fehltag gutgeschrieben wird. Bei 1 wird die ganze Regelarbeitszeit (= Sollstunden) und bei 2 die halbe Regelarbeitszeit gutgeschrieben.
> Bei 0 wird die Sollzeit auf Null gesetzt."

📘 **TRANSLATION**:

> "Under 'Anteil' (Portion), you define the portion of regular working time that is credited to the employee on an absence day. With 1, the full regular working time (= target hours) is credited, and with 2, half the regular working time is credited.
> With 0, the target time is set to zero."

📙 **DERIVED**:

```
type AbsenceType struct {
    Code        string  // Must start with U, K, or S
    Name        string
    Portion     int     // 0 = no credit, 1 = full, 2 = half
    // ...
}

func calculateAbsenceCredit(absenceType AbsenceType, regelarbeitszeit int) int {
    switch absenceType.Portion {
    case 0:
        return 0
    case 1:
        return regelarbeitszeit
    case 2:
        return regelarbeitszeit / 2
    default:
        return 0
    }
}
```

---

## 15.3 Account Assignment Formula

📄 **PAGE 160**

📗 **ORIGINAL**:

> "Kontenwert = Wert _ Faktor
> Ausnahme: Wert = 0 → Tagessollzeit (Zeitplan) _ Faktor"

📘 **TRANSLATION**:

> "Account value = Value _ Factor
> Exception: Value = 0 → Daily target time (time plan) _ Factor"

📙 **DERIVED**:

```
func calculateAccountValue(configValue int, factor float64, dailyTarget int) int {
    if configValue == 0 {
        return int(float64(dailyTarget) * factor)
    }
    return int(float64(configValue) * factor)
}
```

---

# 16. Konten - Accounts

📄 **PAGE 162-163**

## 16.1 Account Types

📗 **ORIGINAL** (from context):

> "Sie entscheiden, ob das Konto dezimal oder ob das Konto in Stunden:Minuten geführt werden soll. Legen Sie fest, ob es sich um ein Tages- oder ein Monatskonto handelt."

📘 **TRANSLATION**:

> "You decide whether the account should be kept in decimal or in hours:minutes format. Determine whether it is a daily or monthly account."

---

## 16.2 Year Carryover

📗 **ORIGINAL**:

> "Im Jahresübertrag wird festgelegt, ob bei einem Jahreswechsel der Wert in das neue Jahr fortgeschrieben werden soll, oder ob das Konto im neuen Jahr bei Null beginnen soll."

📘 **TRANSLATION**:

> "In 'Jahresübertrag' (Year carryover), it is determined whether the value should be carried forward to the new year at year change, or whether the account should start at zero in the new year."

📙 **DERIVED**:

```
type Account struct {
    ID            string
    Name          string
    Format        AccountFormat  // Decimal or HoursMinutes
    Type          AccountType    // Daily or Monthly
    YearCarryover bool           // true = carry forward, false = reset to 0
    ExportEnabled bool           // Include in payroll export
    PayrollType   *string        // Lohnart for export
}
```

---

# 17. Buchungsarten - Booking Types

📄 **PAGE 164-166**

## 17.1 Standard Booking Types

📙 **DERIVED** - From screenshots and descriptions:

| Code | German            | English           | Behavior           |
| ---- | ----------------- | ----------------- | ------------------ |
| A1   | Kommen            | Arrival           | Start work         |
| A2   | Gehen             | Departure         | End work           |
| P1   | Pause Beginn      | Break start       | Start break        |
| P2   | Pause Ende        | Break end         | End break          |
| D1   | Dienstgang Beginn | Work errand start | Start paid absence |
| D2   | Dienstgang Ende   | Work errand end   | End paid absence   |

---

# 18. Feiertage - Holidays

📄 **PAGE 20-23**

## 18.1 Holiday Categories

📗 **ORIGINAL**:

> "Je nach Kategorie wird eine bestimmte Tagessumme gutgeschrieben."

📘 **TRANSLATION**:

> "Depending on the category, a certain daily total is credited."

---

📗 **ORIGINAL** (from example):

> "Im obigen Beispiel haben die Feiertage Kategorie 1. Für Heiligabend und Silvester wurde die Kategorie 2 zugeteilt."

📘 **TRANSLATION**:

> "In the example above, the holidays have Category 1. For Christmas Eve and New Year's Eve, Category 2 was assigned."

📙 **DERIVED**:

```
type Holiday struct {
    Date     time.Time
    Name     string
    Category int  // 1 = full, 2 = half, 3 = custom
}

// Category determines credit based on DayPlan.HolidayCredit settings
```

---

## 18.2 Holiday + Absence Priority

📄 **PAGE 160**

📗 **ORIGINAL**:

> "Das Kürzel am Feiertag bedeutet, dass ZMI Time bei Feiertagen ein anderes Fehltagekürzel verwenden soll.
> Die Priorität gibt vor, welche Berechnung zum Tragen kommt, falls zusätzlich zum Feiertag ein Fehltag eingetragen ist."

📘 **TRANSLATION**:

> "The 'Code on holiday' means that ZMI Time should use a different absence code on holidays.
> The priority determines which calculation takes effect if an absence day is entered in addition to a holiday."

---

## 18.3 Holiday Maintenance Notes

📄 **PAGE 23**

📗 **ORIGINAL**:

> "Haben Sie Feiertage vor dem aktuellen Tag gelöscht oder geändert,
> müssen die betroffenen Monate neu berechnet werden!
> Die Feiertage müssen pro Mandant angelegt werden."

📘 **TRANSLATION**:

> "If you delete or change holidays before the current day,
> the affected months must be recalculated!
> Holidays must be created per mandant (tenant)."

📙 **DERIVED**:

```
If holiday changes affect past dates:
  -> mark affected months for recalculation
Holidays are tenant-specific.
```

---

# 19. Urlaubsberechnung - Vacation Calculation

📄 **PAGE 211-214**

## 19.1 Calculation Basis

📗 **ORIGINAL**:

> "Im Reiter Urlaubsberechnung können Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht."

📘 **TRANSLATION**:

> "In the 'Vacation calculation' tab, you can set whether the vacation calculation refers to the calendar year or the entry date."

---

## 19.2 Special Calculations - Age

📄 **PAGE 212**

📗 **ORIGINAL**:

> "Sonderberechnung Alter
> In der Beispielberechnung soll sich der Urlaubsanspruch um zwei Tag erhöhen, wenn der/die Mitarbeiter/-in älter als 50 Jahre ist."

📘 **TRANSLATION**:

> "Special calculation Age
> In the example calculation, the vacation entitlement should increase by two days if the employee is older than 50 years."

---

## 19.3 Special Calculations - Tenure

📄 **PAGE 212**

📗 **ORIGINAL**:

> "Sonderberechnung Betriebszugehörigkeit
> Im Beispiel unten wurde eine Berechnung angelegt, bei der ein/-e Mitarbeiter/-in einen zusätzlichen Urlaubstag erhält, wenn er 5 Jahre im Unternehmen tätig ist."

📘 **TRANSLATION**:

> "Special calculation Tenure
> In the example below, a calculation was created where an employee receives an additional vacation day when they have been with the company for 5 years."

---

## 19.4 Special Calculations - Disability

📄 **PAGE 213**

📗 **ORIGINAL**:

> "Sonderberechnung Behinderung
> Diese Sonderberechnung wird berücksichtigt, sofern im Personalstamm der Haken Schwerbehinderung gesetzt ist. Im Beispiel erhält ein/-e Mitarbeiter/-in mit Behinderung 5 zusätzliche Urlaubstage im Jahr."

📘 **TRANSLATION**:

> "Special calculation Disability
> This special calculation is considered if the 'Severe disability' checkbox is set in the employee master. In the example, an employee with disability receives 5 additional vacation days per year."

📙 **DERIVED** - Vacation Calculation:

```
type VacationSpecialCalc struct {
    Type      SpecialCalcType  // Age, Tenure, Disability
    Threshold int              // Age in years OR tenure in years
    Value     int              // Additional days
}

func calculateVacation(employee Employee, baseVacation int, specials []VacationSpecialCalc) int {
    total := baseVacation

    for _, special := range specials {
        switch special.Type {
        case SpecialCalcAge:
            if employee.Age() >= special.Threshold {
                total += special.Value
            }
        case SpecialCalcTenure:
            if employee.TenureYears() >= special.Threshold {
                total += special.Value
            }
        case SpecialCalcDisability:
            if employee.SevereDisability {
                total += special.Value
            }
        }
    }

    return total
}
```

---

# 20. Kappungsregeln - Capping Rules

📄 **PAGE 215-217**

## 20.1 Year-End Capping

📄 **PAGE 215**

📗 **ORIGINAL**:

> "Kappung zum Jahresende
> Soll zum Jahresende der Resturlaub der Mitarbeiter/-innen gestrichen werden, legen Sie die Kappung wie folgt an:"

📘 **TRANSLATION**:

> "Year-end capping
> If the remaining vacation of employees should be forfeited at year-end, create the capping as follows:"

---

## 20.2 Mid-Year Capping

📄 **PAGE 215**

📗 **ORIGINAL**:

> "Kappung während des Jahres
> Im Beispiel unten wurde eine Kappung des Resturlaubs aus dem Vorjahr zum 31.03. angelegt."

📘 **TRANSLATION**:

> "Mid-year capping
> In the example below, a capping of remaining vacation from the previous year was created for March 31."

---

## 20.3 Individual Exceptions

📄 **PAGE 217**

📗 **ORIGINAL**:

> "Hinweis: Es besteht die Möglichkeit, das System so zu konfigurieren, dass einzelne Mitarbeiter/-innen trotz aktiver Kappung ihren Resturlaub bzw. Teile davon behalten können."

📘 **TRANSLATION**:

> "Note: It is possible to configure the system so that individual employees can keep their remaining vacation or parts of it despite active capping."

📙 **DERIVED**:

```
type CappingRule struct {
    ID          string
    Name        string
    Date        MonthDay  // e.g., March 31
    CapValue    int       // 0 = forfeit all, >0 = cap at this value
    AppliesTo   CappingScope  // PreviousYearVacation, FlexTime, etc.
}

type EmployeeCappingException struct {
    EmployeeID     string
    CappingRuleID  string
    ExemptionType  ExemptionType  // FullExemption, PartialExemption
    RetainValue    *int           // For partial: how much to keep
}
```

---

# 21. Buchungsübersicht - Booking Overview

📄 **PAGE 148-150**

## 21.1 Booking Value Types

📗 **ORIGINAL**:

> "Die Anzeige der Buchungen ist folgendermaßen organisiert:
> Die Buchungen werden in Pärchen zusammengesetzt, ZMI Time sucht sich beim Einlesen die A1- und A2-Buchung eines Tages, welche der Kommt- und Geht-Buchung entspricht, und setzt beide in eine Zeile."

📘 **TRANSLATION**:

> "The display of bookings is organized as follows:
> Bookings are combined into pairs. ZMI Time finds the A1 and A2 booking of a day when reading, which correspond to the arrival and departure booking, and puts both in one row."

---

📗 **ORIGINAL**:

> "Jede einzelne Buchung ist wiederum in drei Werte aufgeteilt.
> Der Wert Original ist der eingelesene Wert aus dem Terminal. Er bleibt bestehen und kann nicht geändert werden.
> Der Wert Editiert entspricht üblicherweise dem Originalwert, allerdings kann dieser vom Benutzer geändert werden.
> Der Berechnet-Wert ist derjenige, mit dem ZMI Time rechnet, also in Abhängigkeit der im Tagesplan eingestellten Vorgabewerte Toleranz, Abgleich und der Uhrzeiten zwischen Kommen und Gehen."

📘 **TRANSLATION**:

> "Each individual booking is in turn divided into three values.
> The 'Original' value is the value read from the terminal. It remains and cannot be changed.
> The 'Edited' value usually corresponds to the original value, but can be changed by the user.
> The 'Calculated' value is the one ZMI Time uses for calculation, depending on the default values set in the day plan: tolerance, rounding, and the times between arrival and departure."

📙 **DERIVED**:

```
type BookingValue struct {
    Original   int  // From terminal, immutable
    Edited     int  // User-editable, defaults to Original
    Calculated int  // After tolerance/rounding applied
}

type Booking struct {
    ID         string
    Time       BookingValue
    Direction  Direction  // In or Out
    Category   Category   // Work, Break, Errand
    // ...
}
```

---

## 21.2 Calculation Trigger

📄 **PAGE 150**

📗 **ORIGINAL**:

> "Nach erfolgter Eingabe von Buchungen kann der Tag über Tag berechnen sofort berechnet werden, um sich von der Richtigkeit der Eingaben zu überzeugen."

📘 **TRANSLATION**:

> "After entering bookings, the day can be immediately calculated via 'Calculate day' to verify the correctness of the entries."

---

📗 **ORIGINAL**:

> "Hinweis: Die finale Berechnung eines Tages erfolgt immer erst am darauffolgenden Tag z.B. während der automatischen Berechnung in der Nacht. Erst dann werden die Paare endgültig zusammengefügt und berechnet."

📘 **TRANSLATION**:

> "Note: The final calculation of a day always occurs only on the following day, e.g., during the automatic calculation at night. Only then are the pairs finally assembled and calculated."

---

# 22. Offsetwerte - Initial Values

📄 **PAGE 97-101**

## 22.1 Vacation Offset

📄 **PAGE 97-98**

📗 **ORIGINAL**:

> "In der Regel sind bei der Einführung der Zeiterfassung bestimmte Startwerte in die Software zu übernehmen. Typische Offsetwerte sind:
>
> - Gleitzeitkonto
> - Resturlaub"

📘 **TRANSLATION**:

> "Usually, when introducing time tracking, certain starting values must be transferred to the software. Typical offset values are:
>
> - Flextime account
> - Remaining vacation"

---

## 22.2 Flextime Offset Location

📄 **PAGE 99-101**

📗 **ORIGINAL**:

> "Um den Startwert für Gleitzeit zu hinterlegen, klicken Sie im Personalstamm auf Auswerten."
> [...]
> "Starttermin für die Einführung von ZMI Time im Unternehmen: 01.03.
> Der Startwerte für Gleitzeit muss immer im Vormonat angegeben werden, in unserem Fall also im Februar."

📘 **TRANSLATION**:

> "To store the starting value for flextime, click on 'Evaluate' in the employee master."
> [...]
> "Start date for introducing ZMI Time in the company: March 1.
> The starting value for flextime must always be specified in the previous month, in our case February."

📙 **DERIVED**:

```
// To set initial flextime balance of 12 hours for March 1 start:
// 1. Go to February month values
// 2. Set "Gleitzeitübertrag Folgemonat" (Flextime carryover next month) = 12:00
// 3. March calculation will start with 12:00 balance
```

---

# 23. Derived Formulas

⚠️ **WARNING**: All formulas in this section are DERIVED from the manual descriptions. They should be verified against actual ZMI behavior.

## 23.1 Net Time Calculation

📙 **DERIVED**:

```
NetTime = GrossTime - TotalBreakDeduction

if (MaxNetWorkTime > 0 && NetTime > MaxNetWorkTime) {
    CappedTime = NetTime - MaxNetWorkTime
    NetTime = MaxNetWorkTime
}
```

## 23.2 Overtime/Undertime Calculation

📙 **DERIVED**:

```
Difference = NetTime - Regelarbeitszeit

if (Difference > 0) {
    Overtime = Difference
    Undertime = 0
} else {
    Overtime = 0
    Undertime = abs(Difference)
}
```

## 23.3 Complete Break Deduction

📙 **DERIVED**:

```
func calculateBreakDeduction(pairs []BookingPair, recordedBreak int, grossTime int, configs []BreakConfig) int {
    totalDeduction := 0

    for _, cfg := range configs {
        switch cfg.Type {
        case BreakTypeFixed:
            // Fixed breaks: check time window overlap
            // ALWAYS deducted regardless of manual breaks
            if cfg.StartTime != nil && cfg.EndTime != nil {
                for _, pair := range pairs {
                    if pair.Category == CategoryWork {
                        overlap := calculateOverlap(
                            pair.StartTime, pair.EndTime,
                            *cfg.StartTime, *cfg.EndTime,
                        )
                        totalDeduction += min(overlap, cfg.Duration)
                    }
                }
            }

        case BreakTypeVariable:
            // Variable breaks: only if NO manual break recorded
            if recordedBreak == 0 {
                if cfg.AfterWorkMinutes == nil || grossTime >= *cfg.AfterWorkMinutes {
                    totalDeduction += cfg.Duration
                }
            }

        case BreakTypeMinimum:
            // Minimum breaks: after threshold, with optional proportional
            if cfg.AfterWorkMinutes != nil && grossTime >= *cfg.AfterWorkMinutes {
                if cfg.MinutesDifference {
                    overtime := grossTime - *cfg.AfterWorkMinutes
                    totalDeduction += min(overtime, cfg.Duration)
                } else {
                    totalDeduction += cfg.Duration
                }
            }
        }
    }

    return totalDeduction
}

func calculateOverlap(start1, end1, start2, end2 int) int {
    overlapStart := max(start1, start2)
    overlapEnd := min(end1, end2)
    if overlapEnd > overlapStart {
        return overlapEnd - overlapStart
    }
    return 0
}
```

## 23.4 Tolerance Application

📙 **DERIVED**:

```
func applyTolerance(booking int, direction Direction, dayPlan DayPlan) (adjusted int, violation bool) {
    if dayPlan.Type == PlanTypeGleitzeit {
        return applyGleitzeitTolerance(booking, direction, dayPlan)
    }
    return applyFestarbeitszeitTolerance(booking, direction, dayPlan)
}

func applyGleitzeitTolerance(booking int, direction Direction, dp DayPlan) (int, bool) {
    if direction == DirectionIn {
        windowStart := dp.KommenVon
        if dp.ToleranzKommenMinus > 0 {
            windowStart = dp.KommenVon - dp.ToleranzKommenMinus
        }

        if booking < windowStart {
            return windowStart, true  // Before tolerance window, violation
        }
        if booking < dp.KommenVon {
            return booking, true  // Within tolerance but before window, violation
        }
        if booking <= dp.KommenBis {
            return booking, false  // Within window, no violation
        }
        return booking, true  // After window, violation
    }

    // Similar logic for departure...
    return booking, false
}
```

## 23.5 Rounding Application

📙 **DERIVED**:

```
func applyRounding(time int, config RoundingConfig) int {
    switch config.Type {
    case RoundingTypeUp:
        if time % config.Interval == 0 {
            return time
        }
        return ((time / config.Interval) + 1) * config.Interval

    case RoundingTypeDown:
        return (time / config.Interval) * config.Interval

    case RoundingTypeMath:
        remainder := time % config.Interval
        if remainder >= config.Interval / 2 {
            return ((time / config.Interval) + 1) * config.Interval
        }
        return (time / config.Interval) * config.Interval

    case RoundingTypeAdd:
        return time + config.Value

    case RoundingTypeSubtract:
        return time - config.Value
    }
    return time
}
```

---

# 24. Glossary

| German             | English              | Context                         |
| ------------------ | -------------------- | ------------------------------- |
| Abgleich           | Rounding             | Booking time adjustment         |
| Abteilung          | Department           | Organizational unit             |
| aktiv              | active               | Presence required flag          |
| Anteil             | Portion              | Absence time credit fraction    |
| Anwesenheitszeit   | Presence time        | Time employee was present       |
| Arbeitszeit        | Work time            | Working hours                   |
| Austritt           | Exit                 | Employment end date             |
| Berechnung         | Calculation          | Logic/rule                      |
| Beschäftigungstyp  | Employment type      | Full/part time classification   |
| Buchung            | Booking              | Time stamp entry                |
| Buchungsart        | Booking type         | Category of time entry          |
| Eintritt           | Entry                | Employment start date           |
| Fehltag            | Absence day          | Day not worked                  |
| Feiertag           | Holiday              | Public holiday                  |
| Festarbeitszeit    | Fixed working time   | Rigid schedule                  |
| Gleitzeit          | Flextime             | Flexible schedule               |
| Gleitzeitkonto     | Flextime account     | Overtime balance                |
| Jahresurlaub       | Annual vacation      | Yearly vacation days            |
| Jahresübertrag     | Year carryover       | Balance transfer to new year    |
| Kappung            | Capping              | Limiting/forfeiting balances    |
| Kappungskonto      | Capping account      | Account for capped time         |
| Kernzeit           | Core time            | Mandatory presence period       |
| Kernzeitverletzung | Core time violation  | Booking outside required window |
| Kommen             | Arrival              | Clock in                        |
| Konto              | Account              | Time tracking bucket            |
| Lohnart            | Payroll type         | Export code for payroll         |
| Mandant            | Client               | Company/organization            |
| Mehrarbeit         | Overtime             | Hours above target              |
| Minderarbeit       | Undertime            | Hours below target              |
| Mindestpause       | Minimum break        | Break after threshold           |
| Minuten Differenz  | Minutes difference   | Proportional break deduction    |
| Monatsbewertung    | Monthly evaluation   | End-of-month calculation        |
| Pause              | Break                | Rest period                     |
| Personalstamm      | Employee master      | Employee database               |
| PIN                | PIN                  | Personal ID number              |
| Regelarbeitszeit   | Regular working time | Daily target hours              |
| Resturlaub         | Remaining vacation   | Vacation balance                |
| Schicht            | Shift                | Work shift                      |
| Schichterkennung   | Shift detection      | Auto-detect shift from booking  |
| Sollstunden        | Target hours         | Expected work time              |
| Sollzeit           | Target time          | Expected work duration          |
| Sonderberechnung   | Special calculation  | Bonus vacation rules            |
| Tagesplan          | Day plan             | Daily work schedule template    |
| Tagessumme         | Daily total          | Total hours for day             |
| Tarif              | Tariff               | Employment contract terms       |
| Teilzeitgrad       | Part-time degree     | Part-time percentage            |
| Toleranz           | Tolerance            | Booking time flexibility        |
| Urlaub             | Vacation             | Paid leave                      |
| Urlaubsbewertung   | Vacation valuation   | Days deducted per vacation      |
| variabel           | Variable             | Conditional break type          |
| Wochenplan         | Week plan            | Weekly schedule template        |
| Zeitgutschrift     | Time credit          | Hours credited                  |
| Zeitplan           | Time plan            | Schedule                        |
| Zuschlag           | Surcharge            | Bonus time credit               |

---

# Document Verification Status

| Section               | Original Quotes | Translations | Derived Logic            |
| --------------------- | --------------- | ------------ | ------------------------ |
| System Architecture   | ✅              | ✅           | ⚠️ Verify                |
| Day Plans             | ✅              | ✅           | ⚠️ Verify                |
| Fixed Working Time    | ✅              | ✅           | ⚠️ Verify                |
| Flexible Working Time | ✅              | ✅           | ⚠️ Verify                |
| Breaks                | ✅              | ✅           | ⚠️ Verify                |
| Tolerance             | ✅              | ✅           | ⚠️ Verify                |
| Rounding              | ✅              | ✅           | ⚠️ Verify                |
| Special Functions     | ✅              | ✅           | ⚠️ Verify                |
| Surcharges            | ✅              | ✅           | ⚠️ Verify                |
| Shift Detection       | ✅              | ✅           | ⚠️ Verify                |
| Week Plans            | ✅              | ✅           | ⚠️ Verify                |
| Monthly Evaluation    | ✅              | ✅           | ⚠️ Verify                |
| Employee Data         | ✅              | ✅           | ⚠️ Verify                |
| Tariff                | ✅              | ✅           | ⚠️ Verify                |
| Absence Days          | ✅              | ✅           | ⚠️ Verify                |
| Accounts              | ✅              | ✅           | ⚠️ Verify                |
| Booking Types         | ⚠️ Partial      | ⚠️ Partial   | ⚠️ Verify                |
| Holidays              | ✅              | ✅           | ⚠️ Verify                |
| Vacation Calculation  | ✅              | ✅           | ⚠️ Verify                |
| Capping Rules         | ✅              | ✅           | ⚠️ Verify                |
| Booking Overview      | ✅              | ✅           | ⚠️ Verify                |
| Offset Values         | ✅              | ✅           | ⚠️ Verify                |
| Derived Formulas      | N/A             | N/A          | ⚠️ ALL need verification |

---

**END OF DOCUMENT**
