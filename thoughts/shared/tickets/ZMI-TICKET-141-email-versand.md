# ZMI-TICKET-141: E-Mail-Versand — Vorlagen & Anhänge

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 5 — PDF & Versand
Source: plancraft-anforderungen.md.pdf, Abschnitt 11.5 E-Mail-Vorlagen, 11.6 Automatische Anhänge
Blocked by: ZMI-TICKET-140

## Goal
E-Mail-Versand direkt aus dem System für alle Dokumententypen. Pro Dokumententyp konfigurierbare E-Mail-Vorlagen mit Platzhaltern. Automatische Anhänge (PDF des Dokuments + konfigurierbare Standard-Anhänge wie AGB). HTML-formatierte E-Mails.

## Scope
- **In scope:** E-Mail-Vorlagen (CRUD, Platzhalter), Versand-Logik (SMTP), PDF als Anhang, Standard-Anhänge (AGB etc.), Versand-Protokoll, Retry bei Fehler.
- **Out of scope:** XRechnung-Versand (ZMI-TICKET-142), Kundenportal-Benachrichtigungen (ZMI-TICKET-190).

## Requirements

### E-Mail-Vorlagen

#### Tabelle `email_templates`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| document_type | VARCHAR(30) | NOT NULL | Dokumententyp |
| name | VARCHAR(255) | NOT NULL | Vorlagenname |
| subject | VARCHAR(500) | NOT NULL | Betreff mit Platzhaltern |
| body_html | TEXT | NOT NULL | HTML-Body mit Platzhaltern |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Standard-Vorlage |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

### Platzhalter
- `{Kundenname}` — Name des Kontakts
- `{Anrede}` — Herr/Frau + Nachname
- `{Dokumentennummer}` — z.B. "RE-2026-0042"
- `{Betrag}` — Brutto-Betrag formatiert
- `{Fälligkeitsdatum}` — Zahlungsziel
- `{Firmenname}` — Tenant-Firmenname
- `{Projektname}` — Projektname (wenn vorhanden)

### Automatische Anhänge

#### Tabelle `email_default_attachments`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| document_type | VARCHAR(30) | NULL | NULL = für alle Typen |
| file_id | UUID | FK tenant_files, NOT NULL | Hochgeladene Datei (z.B. AGB.pdf) |
| name | VARCHAR(255) | NOT NULL | Anzeigename |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INT | NOT NULL, DEFAULT 0 | |

### Versand-Protokoll

#### Tabelle `email_send_log`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| to_email | VARCHAR(255) | NOT NULL | Empfänger |
| cc_emails | TEXT[] | | CC-Empfänger |
| subject | VARCHAR(500) | NOT NULL | Gesendeter Betreff |
| status | VARCHAR(20) | NOT NULL | 'pending', 'sent', 'failed', 'retrying' |
| error_message | TEXT | | Bei Fehler |
| sent_at | TIMESTAMPTZ | | |
| retry_count | INT | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Business Rules
1. E-Mails werden über SMTP versendet (Konfiguration pro Tenant oder global).
2. PDF des Dokuments wird automatisch angehängt.
3. Standard-Anhänge werden hinzugefügt (wenn konfiguriert).
4. Bei Versand-Fehler: 3 Retries mit Backoff (1min, 5min, 15min).
5. Nach erfolgreicnem Versand: `document.status → sent`, `sent_at` gesetzt.
6. Versand nur für finalisierte Dokumente.
7. Empfänger-Adresse aus Kontakt oder manuell eingeben.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{id}/send | Dokument per E-Mail versenden |
| GET | /documents/{id}/send-log | Versandprotokoll |
| GET | /email-templates | Vorlagen auflisten |
| POST | /email-templates | Vorlage erstellen |
| PATCH | /email-templates/{id} | Vorlage bearbeiten |
| DELETE | /email-templates/{id} | Vorlage löschen |
| POST | /email-templates/{id}/preview | Vorlage mit Platzhaltern vorschauen |
| GET | /email-default-attachments | Standard-Anhänge |
| POST | /email-default-attachments | Anhang hinzufügen |
| DELETE | /email-default-attachments/{id} | Anhang entfernen |

#### POST /documents/{id}/send Request
```json
{
  "to": "mueller@example.com",
  "cc": ["buchhaltung@example.com"],
  "template_id": "...",
  "custom_message": "Optionaler Zusatztext",
  "attach_defaults": true
}
```

### Permissions
- `documents.send` — Dokumente versenden
- `email_templates.manage` — Vorlagen verwalten

## Acceptance Criteria
1. E-Mail-Vorlagen pro Dokumententyp konfigurierbar.
2. Platzhalter werden korrekt aufgelöst.
3. PDF als Anhang.
4. Standard-Anhänge konfigurierbar.
5. Retry bei Versand-Fehler.
6. Versandprotokoll.
7. Dokument-Status wird auf "sent" aktualisiert.

## Tests

### Unit Tests
- `TestEmail_ResolvePlaceholders`: Alle Platzhalter korrekt ersetzt.
- `TestEmail_ResolvePlaceholders_Missing`: Fehlender Platzhalter → leer.
- `TestEmail_DefaultAttachments`: Korrekte Anhänge aus Konfiguration.
- `TestEmail_Retry_Logic`: 1. Fehler → Retry nach 1min.
- `TestEmail_Retry_MaxExceeded`: 3 Fehler → status=failed.

### API Tests
- `TestEmailHandler_Send_200`: E-Mail versendet.
- `TestEmailHandler_Send_409_Draft`: Entwurf → 409.
- `TestEmailHandler_Send_400_NoEmail`: Kein Empfänger → 400.
- `TestEmailHandler_Templates_CRUD`: Vorlagen erstellen/bearbeiten/löschen.
- `TestEmailHandler_SendLog_200`: Protokoll abrufbar.

### Integration Tests
- `TestEmail_FullFlow`: Dokument fertigstellen → Vorlage auswählen → Versenden → Log prüfen → Status=sent.
- `TestEmail_WithDefaultAttachments`: AGB als Standard-Anhang → im Versand enthalten.

### Test Case Pack
1) **Standard-Versand**: Rechnung → E-Mail mit PDF + AGB → sent.
2) **Platzhalter-Auflösung**: `{Kundenname}` → "Müller", `{Betrag}` → "6.241,31 €".
3) **Versand-Fehler**: SMTP down → 3 Retries → status=failed.

## Verification Checklist
- [ ] Migration: email_templates, email_default_attachments, email_send_log
- [ ] SMTP-Konfiguration
- [ ] Vorlagen CRUD
- [ ] Platzhalter-Auflösung
- [ ] PDF als Anhang
- [ ] Standard-Anhänge
- [ ] Retry-Logik
- [ ] Versandprotokoll
- [ ] Status-Update auf "sent"
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-140 (PDF-Generierung)
- ZMI-TICKET-101 (Kontakte — E-Mail-Adressen)

## Notes
- SMTP-Konfiguration: Zunächst global (z.B. SendGrid/Mailgun). Tenant-eigener SMTP in V2.
- HTML-E-Mails: Einfaches HTML, keine komplexen Templates. Muss in allen E-Mail-Clients funktionieren.
