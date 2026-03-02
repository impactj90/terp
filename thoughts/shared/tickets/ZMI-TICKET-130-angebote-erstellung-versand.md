# ZMI-TICKET-130: Angebote — Erstellung, Versand, Gültigkeit

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 4 — Auftragsdokumente
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.1 Dokumententypen (Angebot)
Blocked by: ZMI-TICKET-121, ZMI-TICKET-123
Blocks: ZMI-TICKET-131

## Goal
Angebots-spezifische Geschäftslogik auf Basis der Dokumenten-Engine implementieren. Angebote haben eine Gültigkeitsdauer, können optionale/alternative Positionen enthalten und werden nach Annahme in Auftragsbestätigungen konvertiert. Inklusive Angebotsannahme/-ablehnung durch Kunden.

## Scope
- **In scope:** Angebots-spezifische Felder (valid_until, optionale Positionen), Gültigkeits-Tracking, Annahme/Ablehnung-Workflow, Konvertierung Angebot → Auftragsbestätigung, Angebots-Vorlagen, Angebots-Statistik.
- **Out of scope:** PDF-Layout (ZMI-TICKET-140), E-Mail-Versand (ZMI-TICKET-141), Kundenportal-Annahme (ZMI-TICKET-190).

## Requirements

### Angebots-spezifische Felder
Auf `documents` (bereits vorhanden):
- `valid_until` — Gültigkeitsdatum (Default: document_date + konfigurierbare Tage)
- `accepted_at` — Zeitpunkt der Annahme
- `rejected_at` — Zeitpunkt der Ablehnung
- `rejection_reason` — Ablehnungsgrund

### Erweiterung: Tabelle `document_templates`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Template-Name (z.B. "Standard-Malerarbeiten") |
| document_type | VARCHAR(30) | NOT NULL | Dokumententyp |
| introduction_text | TEXT | | Standard-Einleitungstext |
| closing_text | TEXT | | Standard-Schlusstext |
| items_snapshot | JSONB | | Vorlagenstruktur der Positionen |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Standard-Vorlage |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

### Gültigkeits-Logik
- Default-Gültigkeit: `offer_validity_days` aus Tenant-Settings (Default: 30 Tage)
- Abgelaufene Angebote: Status bleibt `sent`, aber API-Response enthält `is_expired: true`
- Kein automatischer Statuswechsel bei Ablauf (Benutzer entscheidet)

### Annahme/Ablehnung
- `POST /documents/{id}/accept` — Angebot annehmen
- `POST /documents/{id}/reject` — Angebot ablehnen (mit Grund)
- Nur bei Status `sent` oder `finalized` möglich
- Annahme → Status `accepted`, optional automatische AB-Erstellung

### Konvertierung Angebot → AB
- Alle Positionen werden kopiert (inkl. Kalkulation)
- Alternative Positionen werden NICHT übernommen (nur angenommene)
- `source_document_id` verweist auf Angebot
- AB erhält eigene Nummer aus AB-Nummernkreis

### Angebots-Vorlagen
- Dokument als Vorlage speichern: POST /document-templates
- Neues Angebot aus Vorlage: POST /documents/from-template
- Vorlagen enthalten: Einleitungs-/Schlusstext, Positionsstruktur (ohne Mengen/Preise oder mit)

### Statistik
- `GET /documents/statistics?type=offer` Response:
```json
{
  "total": 45,
  "by_status": {
    "draft": 5,
    "sent": 12,
    "accepted": 20,
    "rejected": 8
  },
  "conversion_rate": 71.4,
  "average_value": 8500.00,
  "total_value_sent": 102000.00,
  "total_value_accepted": 170000.00,
  "expired_count": 3
}
```

### Business Rules
1. Angebote können optional ohne Kontakt erstellt werden (z.B. für Voranschläge).
2. Gültigkeitsdatum ist optional, wird aber empfohlen.
3. Annahme generiert optional automatisch eine AB (konfigurierbar pro Tenant).
4. Alternative Positionen werden bei Konvertierung gefiltert.
5. Bedarfspositionen werden bei Konvertierung mit Menge=0 übernommen (Kunde bestimmt Bedarf).
6. Abgelaufene Angebote können trotzdem angenommen werden (mit Warnung).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{id}/accept | Angebot annehmen |
| POST | /documents/{id}/reject | Angebot ablehnen |
| POST | /document-templates | Vorlage erstellen |
| GET | /document-templates | Vorlagen auflisten |
| GET | /document-templates/{id} | Vorlage abrufen |
| DELETE | /document-templates/{id} | Vorlage löschen |
| POST | /documents/from-template | Dokument aus Vorlage |
| GET | /documents/statistics | Dokumenten-Statistik |

### Permissions
- `documents.create` — (existiert) Angebote erstellen
- `documents.finalize` — (existiert) Angebote fertigstellen
- `document_templates.manage` — Vorlagen verwalten

## Acceptance Criteria
1. Angebote mit Gültigkeitsdatum erstellbar.
2. Abgelaufene Angebote als `is_expired` markiert.
3. Annahme/Ablehnung-Workflow funktioniert.
4. Konvertierung Angebot → AB korrekt (ohne Alternativen).
5. Angebots-Vorlagen erstell- und nutzbar.
6. Statistik mit Conversion Rate berechnet.

## Tests

### Unit Tests
- `TestOffer_DefaultValidity`: Gültigkeitsdatum = document_date + 30 Tage.
- `TestOffer_IsExpired`: valid_until < heute → is_expired=true.
- `TestOffer_Accept`: Status sent → accepted, accepted_at gesetzt.
- `TestOffer_Accept_Expired_Warning`: Abgelaufen aber angenommen → Warning.
- `TestOffer_Accept_Draft_Error`: Draft → Error (muss finalized/sent sein).
- `TestOffer_Reject`: Status → rejected, reason gespeichert.
- `TestOffer_ConvertToAB`: Alle Normalpositionen kopiert, Alternativen gefiltert.
- `TestOffer_ConvertToAB_DemandPositions`: Bedarfspositionen mit Menge=0 übernommen.
- `TestOffer_ConvertToAB_WithCalc`: Kalkulation auch kopiert.
- `TestOffer_Template_Create`: Vorlage aus bestehendem Angebot.
- `TestOffer_Template_Apply`: Neues Angebot aus Vorlage → Texte und Positionen.
- `TestOffer_Statistics_ConversionRate`: 20 accepted / 28 entschieden = 71.4%.

### API Tests
- `TestOfferHandler_Accept_200`: Erfolgreiche Annahme.
- `TestOfferHandler_Accept_409_WrongStatus`: Draft → 409.
- `TestOfferHandler_Reject_200`: Ablehnung mit Grund.
- `TestOfferHandler_Statistics_200`: Statistik-Response.
- `TestOfferHandler_Template_201`: Vorlage erstellen.
- `TestOfferHandler_FromTemplate_201`: Aus Vorlage erstellen.
- `TestOfferHandler_TenantIsolation`: Vorlage von Tenant A nicht über B.

### Integration Tests
- `TestOffer_FullLifecycle`: Erstellen → Positionen → Fertigstellen → Versenden → Annehmen → AB generieren.
- `TestOffer_RejectAndRevise`: Ablehnung → Klonen → Preise anpassen → Erneut senden.

### Test Case Pack
1) **Standard-Angebotsworkflow**: Erstellen → 3 Positionen → Fertigstellen (AN-2026-0001) → Annehmen → AB-Erstellung.
2) **Angebot mit Alternativen**: 2 Normal + 1 Alternativ → Annehmen → AB nur mit 2 Normalpositionen.
3) **Abgelaufenes Angebot**: valid_until = gestern → is_expired=true, trotzdem annehmbar.
4) **Vorlage nutzen**: "Standard Maler" Vorlage → Neues Angebot → Texte und Positionen vorhanden.

## Verification Checklist
- [ ] Migration: Neue Felder auf documents (accepted_at, rejected_at, rejection_reason)
- [ ] Migration: document_templates Tabelle
- [ ] Migration reversibel
- [ ] Gültigkeits-Logik (is_expired berechnet)
- [ ] Annahme/Ablehnung nur bei korrektem Status
- [ ] Konvertierung ohne Alternativpositionen
- [ ] Vorlagen CRUD
- [ ] Statistik mit Conversion Rate
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell)
- ZMI-TICKET-123 (Dokumenten-Workflow)
- ZMI-TICKET-101 (Kontakte)

## Notes
- Angebote sind der Einstiegspunkt in den Dokumenten-Workflow. Viele Kunden erstellen zuerst Angebote und konvertieren diese dann.
- Die Conversion Rate ist ein wichtiger KPI für Handwerksbetriebe.
- Vorlagen sparen Zeit bei wiederkehrenden Arbeiten (z.B. "Standard Badsanierung").
