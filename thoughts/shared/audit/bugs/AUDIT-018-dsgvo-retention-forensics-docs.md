# AUDIT-018 — DSGVO-Retention als Forensik-SLA dokumentieren

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| **Priority**        | P3                                       |
| **Category**        | 4. Audit-Log-Integrität                   |
| **Severity**        | INFORMATIVE                              |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-018)       |
| **Estimated Scope** | 1 Doc-File (Handbuch)                     |

---

## Problem

Der DSGVO-Retention-Cron löscht `audit_logs`-Zeilen tenant-seitig nach konfigurierbarer Frist (Default 24 Monate). Das ist by-design pflichtkonform, aber es bedeutet: nach Ablauf der Retention-Frist stehen keine tenant-seitigen Forensik-Daten mehr zur Verfügung. Platform-seitige `platform_audit_logs` werden nicht gelöscht und bleiben unbegrenzt erhalten, aber das ist nicht offen dokumentiert. Kunden, die eine Forensik-Anforderung mit längerer Frist haben (IT-Sicherheitsvorfall, Audit), könnten fälschlich erwarten, dass Terp alle Logs unbegrenzt aufbewahrt. Ohne explizite Doku riskiert Terp entweder Verträge mit unrealistischen Zusicherungen oder Streit im Incident-Fall.

## Root Cause

Keine User-facing-Dokumentation der Retention-Semantik:

```markdown
<!-- ❌ docs/TERP_HANDBUCH.md — erwähnt DSGVO-Löschlauf als Feature, aber nicht die Implikation -->
```

## Required Fix

Abschnitt in `docs/TERP_HANDBUCH.md` (oder im passenden Modul-Kapitel) ergänzen:

```markdown
<!-- ✅ docs/TERP_HANDBUCH.md (Abschnitt "DSGVO & Retention") -->

### Audit-Log-Retention und Forensik-SLA

- **Tenant-seitige `audit_logs`**: Werden per DSGVO-Retention-Cron nach der im Tenant
  konfigurierten Frist (Default: 24 Monate) gelöscht. Dies ist Pflicht nach
  DSGVO Art. 5 Abs. 1 Buchst. e (Speicherbegrenzung). Die Löschung selbst wird
  in `dsgvo_delete_logs` und `audit_logs` (Action `dsgvo_execute`) protokolliert.

- **Platform-seitige `platform_audit_logs`**: Werden NICHT automatisch gelöscht
  und bleiben unbegrenzt erhalten. Operator-Aktionen (Impersonation, Tenant-
  Management, Bootstrap) sind damit langfristig rekonstruierbar.

- **Forensik-SLA**: Terp garantiert Forensik-Daten nur innerhalb der konfigurierten
  Tenant-Retention-Frist. Für Incidents jenseits der Frist muss der Kunde
  explizit (vor Ablauf) Logs exportieren oder die Frist anheben.

- **Empfehlung**: Für Tenants mit erhöhten Compliance-Anforderungen (ISO 27001,
  TISAX, KRITIS) die Retention-Frist auf 36 oder 84 Monate setzen. Die Mindest-
  Retention nach HGB/AO (6 bzw. 10 Jahre für buchhaltungsrelevante Datensätze)
  wird über separate Mechanismen (BillingDocument-Archivierung) erfüllt, nicht
  über `audit_logs`.
```

## Affected Files

| File                      | Line(s) | Specific Issue                                     |
| ------------------------- | ------- | -------------------------------------------------- |
| `docs/TERP_HANDBUCH.md`   | —       | Abschnitt zu Retention/Forensik fehlt              |

## Verification

### Automated

- [ ] Keine — reines Doku-Ticket

### Manual

- [ ] Abschnitt im gerenderten Handbuch sichtbar
- [ ] Links zu DSGVO-Settings-UI korrekt
- [ ] Sprache konsistent (Deutsch, Fach-Ton)
- [ ] Rechtliche Begriffe (HGB, AO, DSGVO Art. 5) korrekt referenziert

## What NOT to Change

- DSGVO-Retention-Code (`dsgvo-retention-service.ts`) — nur Doku
- Platform-Audit-Log-Aufbewahrung — unverändert unbegrenzt
- Tenant-Retention-Defaults (24 Monate) — unverändert
- UI für DSGVO-Einstellungen — separates Baustelle

## Notes for Implementation Agent

- TERP_HANDBUCH ist Kunden-Facing — Sprache präzise, aber nicht juristisch ausgedacht. Für rechtliche Unklarheiten (HGB-/AO-Referenz) besser Support/Legal konsultieren.
- Der Abschnitt gehört idealerweise in ein bestehendes Kapitel zu DSGVO/Datenschutz. Vor dem Write `docs/TERP_HANDBUCH.md` scannen (Grep nach "DSGVO", "Retention", "Löschkonzept") und in den passenden Bereich einordnen.
- Keine Zahlenangaben ohne Quelle — 24-Monate-Default ist aus `dsgvo-retention-service.ts:80-84` (`DEFAULT_RULES`). Sollte sich der Default ändern, Doku nachziehen.
- Platform-seitige Unbegrenzt-Aufbewahrung als bewusstes Design dokumentieren (Insider-Forensik muss über die Tenant-Retention hinaus reichen) — nicht als "haben wir vergessen zu löschen" darstellen.
