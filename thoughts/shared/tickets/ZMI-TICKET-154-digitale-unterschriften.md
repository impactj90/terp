# ZMI-TICKET-154: Digitale Unterschriften — Capture & Embedding

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 6 — Baudokumentation & Aufmaß
Source: plancraft-anforderungen.md.pdf, Abschnitt 8.6 Digitale Unterschriften
Blocked by: ZMI-TICKET-111
Blocks: ZMI-TICKET-151, ZMI-TICKET-152, ZMI-TICKET-153

## Goal
Touch-/Stift-basierte Unterschriften auf Smartphone/Tablet erfassen und in PDFs einbetten. Unterschriften werden mit Zeitstempel gespeichert und können für Abnahmeprotokolle, Regieberichte und Bautagesberichte verwendet werden.

## Scope
- **In scope:** Signature-Capture API (Empfängt Base64-PNG/SVG), Signatur-Speicherung, PDF-Embedding, Zeitstempel, Verknüpfung mit Berichten.
- **Out of scope:** Frontend Signature-Pad (Canvas), rechtsgültige elektronische Signatur (eIDAS).

## Requirements

### Datenmodell

#### Tabelle `signatures`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| signer_name | VARCHAR(255) | NOT NULL | Name des Unterzeichners |
| signer_role | VARCHAR(50) | | 'contractor', 'client', 'employee' |
| image_data | TEXT | NOT NULL | Base64-encoded PNG oder SVG |
| image_format | VARCHAR(10) | NOT NULL | 'png' oder 'svg' |
| signed_at | TIMESTAMPTZ | NOT NULL | Zeitstempel |
| ip_address | VARCHAR(45) | | IP-Adresse bei Erfassung |
| user_agent | VARCHAR(500) | | Browser/App Info |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Business Rules
1. Unterschrift ist immutable nach Erstellung (kein Update).
2. Nachträgliche Änderung am Bericht nach Unterschrift → Neue Version, alte bleibt als Archiv.
3. Zeitstempel wird serverseitig gesetzt (nicht vom Client).
4. Bericht ohne Unterschrift → trotzdem speicherbar, Status "Nicht unterschrieben".

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /signatures | Neue Unterschrift erfassen |
| GET | /signatures/{id} | Unterschrift abrufen (mit Bild) |
| GET | /signatures/{id}/image | Nur das Bild (für PDF-Embedding) |

#### POST /signatures Request
```json
{
  "signer_name": "Max Müller",
  "signer_role": "client",
  "image_data": "data:image/png;base64,iVBORw0KGgo...",
  "image_format": "png"
}
```

### Permissions
- `signatures.create` — Unterschriften erfassen
- `signatures.view` — Unterschriften anzeigen

## Acceptance Criteria
1. Base64-Signatur empfangen und gespeichert.
2. Zeitstempel serverseitig gesetzt.
3. Signatur in PDF einbettbar.
4. Immutable nach Erstellung.

## Tests
### Unit Tests
- `TestSignature_Create`: Valide Base64-PNG → gespeichert mit Zeitstempel.
- `TestSignature_Invalid_Base64`: Ungültige Daten → 400.
- `TestSignature_Immutable`: Update-Versuch → Error.
- `TestSignature_Timestamp_ServerSide`: Client-Zeitstempel ignoriert.

### API Tests
- `TestSignatureHandler_Create_201`, `TestSignatureHandler_Get_200`, `TestSignatureHandler_Image_200`

### Test Case Pack
1) **Signatur erfassen**: Base64-PNG → gespeichert → Bild abrufbar.

## Verification Checklist
- [ ] Migration: signatures Tabelle
- [ ] Base64-Validierung
- [ ] Serverseitiger Zeitstempel
- [ ] Immutability
- [ ] Bild-Abruf für PDF-Embedding
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-111 (Dateiablage)
