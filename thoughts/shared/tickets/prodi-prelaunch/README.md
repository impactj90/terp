# Pro-Di Pre-Launch Erweiterungen

Tickets basierend auf dem HR-Gespräch mit Pro-Di am 15.04.2026.
Ziel: Alle PFLICHT-Tickets vor Pro-Di-Launch (Q3/Q4 2026) fertig.

## Ticket-Übersicht

| Prio | # | Ticket | T-Shirt | Datei |
|---|---|---|---|---|
| PFLICHT | 1 | Nachtschicht-Bewertungslogik | L | [pflicht-01](pflicht-01-nachtschicht-bewertungslogik.md) |
| PFLICHT | 2 | DATEV-Zuschläge im Export-Template + DayPlanBonus-Update | M | [pflicht-02](pflicht-02-datev-zuschlaege.md) |
| PFLICHT | 3 | Überstunden-Auszahlung konfigurierbar | L | [pflicht-03](pflicht-03-ueberstunden-auszahlung.md) |
| PFLICHT | 4 | Probezeit-Erkennung + Reminder | S | [pflicht-04](pflicht-04-probezeit-erkennung.md) |
| SOLL | 5 | Überstundenantrag (Vorab + Reaktiv) | XL | [soll-05](soll-05-ueberstundenantrag.md) |
| SOLL | 6 | "Keine Zeiten erfasst"-Workflow | M | [soll-06](soll-06-zeiten-nachfrage-workflow.md) |
| SOLL | 7 | VI-Wochenenden (Optionale Schichten) | M | [soll-07](soll-07-vi-wochenenden-optional.md) |
| SOLL | 8 | Zuschlagsvorlagen für Tarifverträge | M | [soll-08](soll-08-zuschlagsvorlagen-tarifvertraege.md) |

## Abhängigkeitsgraph

```
pflicht-04 (Probezeit)          ← keine Abhängigkeiten, Quick Win
pflicht-01 (Nachtschicht)       ← keine Abhängigkeiten, sofort startbar
                                  (Design-Entscheidungen getroffen)
pflicht-02 (DATEV-Zuschläge)   ← keine harten Abhängigkeiten, sofort startbar
                                  (Design-Entscheidungen getroffen, parallel zu #1)
     |
     | (Überstunden-Zuschlag liefert Basis für)
     v
pflicht-03 (Überstunden-Ausz.) ← referenziert Zuschlagslogik aus #2

soll-05 (Überstundenantrag)    ← referenziert Auszahlungsregel aus #3
     |                            referenziert Nachtschicht-Bewertung aus #1
     |
soll-06 (Zeiten-Nachfrage)     ← profitiert von #1 (korrekte Tageszuordnung)
                                  muss #7 kennen (optionale Schichten ≠ fehlend)

soll-07 (VI-Wochenenden)       ← keine harten Abhängigkeiten, parallel zu #5/#6 möglich

soll-08 (Zuschlagsvorlagen)    ← baut auf #2 (updateBonus aus Block B) auf;
                                  Umsetzung erst bei Tarifkunde
```

**Empfohlene Reihenfolge:**
1. **pflicht-04** (Probezeit) — sofort startbar, Quick Win
2. **pflicht-01** (Nachtschicht) — sofort startbar, Design-Entscheidungen getroffen
3. **pflicht-02** (DATEV-Zuschläge) — sofort startbar, parallel zu #1 möglich
4. **pflicht-03** (Überstunden-Auszahlung) — nach oder parallel zu #2
5. **soll-07** (VI-Wochenenden) — unabhängig, jederzeit
6. **soll-06** (Zeiten-Nachfrage) — nach #1 und #7
7. **soll-05** (Überstundenantrag) — größtes Ticket, zuletzt (baut auf #1 und #3 auf)
8. **soll-08** (Zuschlagsvorlagen) — nur wenn Tarifkunde onboardet wird

## Post-Launch Backlog (nicht geticktet)

Die folgenden Themen wurden im Gespräch erwähnt, sind aber explizit Post-Launch:

- **§3b EStG steuerfreie Zuschläge**: Trennung steuerfreier/steuerpflichtiger Zuschlagsanteile im DATEV-Export — ausgelagert aus #2. Stub: [post-launch-3b-steuerfreie-zuschlaege.md](../post-launch/post-launch-3b-steuerfreie-zuschlaege.md). Trigger: Pro-Di-Steuerberater fordert an, oder erster Tarifkunde onboardet.
- **Highest-Wins-/Priority-Logik bei kombinierten Zuschlägen**: Aktuelles Verhalten (alle passenden Bonusse akkumulieren) ist für Industriebetriebe korrekt. Post-Launch wenn Kunde fordert.
- **`validFrom`/`validTo` auf DayPlanBonus**: Historisch korrekte Rückwirkung bei Tarifwechseln. Post-Launch wenn Tarifkunde onboardet.
- **Antragswesen ausbauen**: Sonderurlaub, Schichttausch, Freistellungsanträge — erst nach Erfahrung mit dem Überstundenantrag (#5) generalisieren
- **KI-/Optimierungs-Schichtplanung**: Erst nach Discovery-Phase, frühestens 2027
- **Email-Notifications**: Alle Tickets nutzen nur In-App-Notifications. Email-Kanal als separates Feature

## Klärungsfragen für Pro-Di (diese Woche on-site)

Zusammengefasst aus den "Offene Fragen"-Sektionen aller Tickets.

*Tickets 1 (Nachtschicht), 2 (DATEV-Zuschläge) und 3 (Überstunden-Auszahlung) haben keine BLOCKERs — alle Design-Entscheidungen sind getroffen (siehe Tickets). Für #2 ist der einzige externe Task das Einholen der finalen DATEV-Lohnarten-Nummern vom Pro-Di-Steuerberater, was als Onboarding-Schritt vor Go-Live abläuft, nicht als Implementation-Blocker. Für #3 wird der Schwellenwert beim Pro-Di-Onboarding via Admin-UI gesetzt (Platzhalter im Seed).*

### Onboarding-Tasks (nicht Implementation-Blocker)

| # | Ticket | Task |
|---|---|---|
| O1 | DATEV-Zuschläge (#2) | Pro-Di-Steuerberater liefert finale DATEV-Lohnarten-Nummern für Nacht/Samstag/Sonntag — vor Go-Live per Admin-UI setzen, Seed hat Platzhalter |

### Klärung vor Implementation sinnvoll

| # | Ticket | Frage |
|---|---|---|
| 10 | Probezeit (#4) | Reminder-Empfänger: nur HR oder auch Abteilungsleiter? |
| 11 | Probezeit (#4) | Standard-Probezeit: 6 Monate für alle oder 3 Monate für manche? |
| 12 | Probezeit (#4) | Probezeit-Gespräch: Soll ein Workflow dafür existieren? |
| 13 | Überstundenantrag (#5) | Hat Pro-Di heute einen formalisierten Überstunden-Prozess? |
| 14 | Überstundenantrag (#5) | Mehrstufige Genehmigung ab welcher Stundenzahl? |
| 15 | Überstundenantrag (#5) | Reaktiv-Flow ("wieder einstempeln"): wie häufig in der Praxis? |
| 16 | Überstundenantrag (#5) | Genehmiger bei Abwesenheit: wer übernimmt? |
| 17 | Zeiten-Nachfrage (#6) | Check-Frequenz: täglich oder wöchentlich? |
| 18 | Zeiten-Nachfrage (#6) | Eskalationsfrist: nach wie vielen Tagen an Vorgesetzten? |
| 19 | Zeiten-Nachfrage (#6) | "Vergessen zu stempeln": Darf MA selbst nachtragen? |
| 20 | VI-Wochenenden (#7) | Antwortfrist für optionale Schichten? |
| 21 | VI-Wochenenden (#7) | Mindestbesetzung bei optionalen Schichten? |
| 22 | VI-Wochenenden (#7) | Absage nach Annahme möglich? Bis wann? |

## Hinweis: Vertikal-agnostische Formulierung

Alle Tickets sind bewusst so formuliert, dass die Kern-Features für jeden Industriekunden nutzbar sind. Pro-Di-Spezifika (z.B. "Schichtleiter als Default-Genehmiger", "VI-Wochenenden") sind als Tenant-Konfiguration modelliert, nicht als hardcoded Logik. Das entspricht dem Designprinzip "Engine + Default-Konfiguration" analog zur LiquidJS-DATEV-Template-Engine.

Die Sondierung mit der Reinigungsfirma am 18.04.2026 kann dieselben Features nutzen — nur mit anderen Default-Konfigurationen (andere Zuschlagssätze, andere Schichtzeiten, ggf. Tarifvertrags-Regelvorlagen als Post-Launch-Follow-Up).
