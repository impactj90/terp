---
topic: Tatsächliches UI-Verhalten bei VacationBalanceNotFoundError
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
flag: Open Question 2.1 (Research)
---

# VacationBalance UI-Empirical-Test

## Problem

Die Research-Dokumente behaupten, dass ein fehlender `VacationBalance`-Row
in der Urlaubs-UI zu einem `VacationBalanceNotFoundError` (NOT_FOUND)
führt. Dieser Befund ist **theoretisch** durch Code-Inspektion entstanden
und **nicht empirisch** durch Durchklicken der UI verifiziert.

## Aufgabe

Im Dev-Setup einen frischen Demo-Tenant erzeugen, als Demo-Admin
einloggen und:

1. Zum Mitarbeiter-Detail eines der 150 Employees navigieren
2. Den Urlaubs-Tab öffnen
3. Den tatsächlichen Fehler dokumentieren:
   - Toast-Meldung? Inline-Alert? Leere Kachel?
   - Error-Boundary? White-Screen?
4. Screenshot + Reproduktions-Schritte in den Bug `vacation-balance-
   showcase-fix.md` zurückschreiben

## Warum dieser Schritt vor dem eigentlichen Fix

Der Fix (`vacation-balance-showcase-fix.md`) würde den Bug unsichtbar
machen, aber wenn das Fehler-UI für andere Flows auch auftauchen kann
(z.B. Urlaubsantrag eines frischen Employees nach Jahreswechsel), muss
das UI-Verhalten **selbst** robuster werden — nicht nur die Daten.

## Akzeptanzkriterien

- [ ] Screenshot des Error-States
- [ ] Reproduktionsschritte in den Fix-Ticket-Body
- [ ] Entscheidung: reicht Daten-Fix oder muss UI auch fixen?

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` (Open Question 2.1)
- Related: `vacation-balance-showcase-fix.md`, `vacation-balance-lazy-create.md`
