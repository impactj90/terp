# §3b EStG: Trennung steuerfreier und steuerpflichtiger Zuschlagsanteile

**Status**: Stub. Post-Launch. Nicht vor erstem Tarifkunden- oder Steuerberater-Request umsetzen.

## Kontext

Ausgelagert aus `pflicht-02-datev-zuschlaege.md` (Pre-Launch-Fassung, 2026-04-17). Für Pro-Di ist §3b nicht im Pre-Launch-Scope, weil:

- Pro-Di hat keinen Tarifvertrag.
- Der Steuerberater bekommt im Pre-Launch die Zuschlagsstunden als Lohnart und macht die steuerfreie/steuerpflichtige Aufteilung in der Lohnsoftware (DATEV LODAS) selbst.
- Code-Recherche `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` hat bestätigt, dass §3b-Logik aktuell nirgends im Code existiert (nur im ursprünglichen Ticket referenziert).

## Rechtlicher Hintergrund (Referenz)

§3b EStG erlaubt steuerfreie Zuschläge bis zu gesetzlichen Grenzen, jeweils berechnet auf den Grundlohn (max. 50 EUR/h als Bemessungsbasis):
- Nachtarbeit: 25% (grundsätzlich) / 40% (22:00–04:00, mit Schichtbeginn vor Mitternacht)
- Sonntagsarbeit: 50%
- Feiertagsarbeit: 125% / 150% (24./25./26.12., 1.5.)

Übersteigt der tatsächliche Zuschlag diese Grenzen, ist der übersteigende Teil steuerpflichtig. Zwei Teilbeträge müssen separat als Lohnart ausgewiesen werden.

## Grober Scope

**Datenmodell**:
- Tax-Klassifikation am Account oder am DayPlanBonus (z. B. `taxFreePercentage`, `baseWageCapPerHour`).
- Grundlohn-Input: `Employee.hourlyRate` existiert bereits (`prisma/schema.prisma:1934-1936`), fließt aber nicht in die Zuschlagsberechnung. Muss als Berechnungsinput angebunden werden.

**Berechnung**:
- `calculateSurcharges()` um Split-Funktion erweitern: steuerfreier Minutenanteil + steuerpflichtiger Minutenanteil pro Bonus.
- Persistenz: entweder neue `source`-Werte `surcharge_tax_free`/`surcharge_taxable` auf `DailyAccountValue`, oder zwei separate Zielkonten pro Zuschlag.

**Export**:
- DATEV-LODAS-Export und Template-Kontext liefern beide Teilbeträge getrennt.
- Handbuch-Dokumentation mit §3b-Beispielrechnung.

**Validation**:
- Automatische Grenzwertprüfung (z. B. Warning wenn konfigurierter Prozentsatz die §3b-Grenze übersteigt).

## Trigger-Bedingung

Umsetzung erst wenn einer der folgenden Trigger eintritt:
1. Pro-Di-Steuerberater fordert §3b-getrennten Export an.
2. Erster Tarifkunde onboardet (z. B. Gebäudereiniger-Sondierung 18.04.2026 wird Kunde).
3. Gesetzliche Änderung mit Compliance-Relevanz.

## Abgrenzung

- **Nicht** Teil des Pre-Launch-Tickets `pflicht-02-datev-zuschlaege.md`.
- Vor Umsetzung: Steuerberater + Rechtsberatung zur korrekten Mathematik einholen. §3b hat Edge Cases (Mehrfach-Zuschläge, Schichtzulagen) die Fehler teuer machen.

## Verweise

- Pre-Launch-Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md`
- Code-Recherche: `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- Gesetzestext: § 3 Nr. 11 EStG i.V.m. § 3b EStG
