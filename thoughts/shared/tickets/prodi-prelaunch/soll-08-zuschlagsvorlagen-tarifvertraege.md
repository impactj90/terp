# Zuschlagsvorlagen für Tarifverträge (Convenience-Feature)

**Status**: Stub. Soll-Ticket. Umsetzung wenn erster Tarifkunde angebunden wird.

## Kontext

Ausgelagert aus `pflicht-02-datev-zuschlaege.md` (Pre-Launch-Fassung, 2026-04-17). Pro-Di hat keinen Tarifvertrag und pflegt Zuschläge manuell pro DayPlan — das funktioniert. Sobald ein Tarifkunde onboardet wird (z. B. Gebäudereiniger-Sondierung am 18.04.2026), wird das manuelle Setup pro DayPlan mühsam.

**Vertikal-relevant**: Tarifkunden (Reinigung, Gastronomie, Industriedienstleister) erwarten häufig vorkonfigurierte Zuschlagssätze nach ihrem Tarif. Manuelle Pflege pro DayPlan ist fehleranfällig.

## Grober Scope

**Datenmodell (Convenience-Schicht über DayPlanBonus)**:
- Neues Modell `SurchargeTemplate` (tenant-scoped oder system-global als Seed):
  - `name` (z. B. "Gebäudereiniger-Tarif 2026")
  - `description`
  - Eine Liste von `SurchargeTemplateItem` mit Feldern analog zu `DayPlanBonus` (timeFrom, timeTo, calculationType, valueMinutes, appliesOnHoliday, account-Zuordnung via Account.code oder eigenem Template-Alias)

**Apply-Flow**:
- Admin wählt ein Template + eine Menge von DayPlans → System legt pro DayPlan die entsprechenden DayPlanBonus-Einträge an (oder ersetzt bestehende nach Bestätigung).
- Preview zeigt welche DayPlanBonus-Einträge erstellt/überschrieben/gelöscht würden.

**Seed-Templates** (Vorschlag für Rollout):
- "Gebäudereiniger-Tarif" (Nacht 25%, Sonntag 50%, Feiertag 125%)
- "Öffentlicher Dienst TVöD" (variierende Sätze)
- "Metall/Elektro IG Metall" (variierende Sätze)
- Konkrete Werte vor Umsetzung mit einem Tarifberater validieren.

## Abgrenzung

**KEINE neue Berechnungslogik.** Das Feature erzeugt ausschließlich `DayPlanBonus`-Einträge über das bestehende CRUD. Die Berechnung bleibt `calculateSurcharges()` unverändert.

**KEINE Override-Hierarchie.** Nach dem Apply ist jeder DayPlan autark — spätere Template-Änderungen propagieren nicht automatisch. Re-Apply ist ein expliziter Admin-Vorgang.

## Abhängigkeiten

- **Baut auf `pflicht-02-datev-zuschlaege.md` auf** — insbesondere auf `updateBonus` (Block B), um bestehende Bonusse beim Re-Apply zu aktualisieren statt zu löschen.
- Reihenfolge: Erst Pflicht-02 vollständig abgeschlossen, dann dieses Soll-Ticket.

## Trigger-Bedingung

Umsetzung erst wenn:
1. Erster Tarifkunde konkret onboardet wird, **oder**
2. Pro-Di-Mehrwert durch strukturierte Lohnart-Mapping-Templates entsteht (z. B. für verschiedene Steuerberater-Setups).

## Verweise

- Pre-Launch-Ticket: `pflicht-02-datev-zuschlaege.md`
- Code-Recherche: `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- Verwandtes Post-Launch-Ticket: `thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md`
