# ZMI-TICKET-185: API-Keys & Webhooks

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.6 API & Webhooks
Blocked by: Keine

## Goal
API-Key-Authentifizierung für externe Integrationen und Webhook-System für Event-basierte Benachrichtigungen an externe URLs. Ermöglicht Integration mit make.com, n8n, CRM-Systemen.

## Scope
- **In scope:** API-Key-Management (CRUD), Key-Berechtigungen (Nur Lesen / Lesen+Schreiben), Webhook-Konfiguration, Event-basierte Webhook-Aufrufe, Retry mit Backoff, Rate-Limiting.
- **Out of scope:** OAuth2 Provider, API-Versioning.

## Requirements

### API-Keys

#### Tabelle `api_keys`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Schlüsselname |
| key_hash | VARCHAR(255) | NOT NULL | SHA256-Hash des Keys |
| key_prefix | VARCHAR(10) | NOT NULL | Erste 8 Zeichen (für Identifikation) |
| permissions | VARCHAR(20) | NOT NULL | 'read', 'read_write' |
| endpoints | TEXT[] | | Erlaubte Endpoints (NULL = alle) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| last_used_at | TIMESTAMPTZ | NULL | |
| expires_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

**Sicherheit:** Key wird nur einmal bei Erstellung angezeigt, danach nur noch Prefix.

### Webhooks

#### Tabelle `webhooks`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| url | VARCHAR(500) | NOT NULL | Ziel-URL |
| events | TEXT[] | NOT NULL | Event-Typen |
| secret | VARCHAR(255) | NOT NULL | HMAC-Secret für Signatur |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| failure_count | INT | NOT NULL, DEFAULT 0 | |
| last_triggered_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Webhook-Events
- `contact.created`, `contact.updated`
- `project.created`, `project.updated`
- `document.finalized`, `document.sent`
- `payment.created`

### Webhook-Payload
```json
{
  "event": "document.finalized",
  "timestamp": "2026-03-18T14:30:00Z",
  "tenant_id": "...",
  "data": { "document_id": "...", "document_number": "RE-2026-0042", ... }
}
```
Header: `X-Webhook-Signature: sha256=...` (HMAC mit Secret)

### Business Rules
1. API-Key kompromittiert → Key widerrufen, neuen erstellen.
2. Webhook nicht erreichbar → Retry 3× mit Backoff (1min, 5min, 15min), dann deaktivieren + Benachrichtigung.
3. Rate-Limiting: Max Requests pro Minute (konfigurierbar, Default: 60/min).

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /api-keys | Keys auflisten |
| POST | /api-keys | Key erstellen (gibt Key einmalig zurück) |
| DELETE | /api-keys/{id} | Key widerrufen |
| GET | /webhooks | Webhooks auflisten |
| POST | /webhooks | Webhook erstellen |
| PATCH | /webhooks/{id} | Webhook bearbeiten |
| DELETE | /webhooks/{id} | Webhook löschen |
| POST | /webhooks/{id}/test | Test-Event senden |

### Permissions
- `api_keys.manage`, `webhooks.manage`

## Acceptance Criteria
1. API-Keys erstellen/widerrufen.
2. Key nur einmal sichtbar.
3. Webhook-Konfiguration mit Event-Auswahl.
4. HMAC-Signatur auf Webhooks.
5. Retry bei Fehler.
6. Rate-Limiting.

## Tests
### Unit Tests
- `TestAPIKey_Create`: Key generiert, Hash gespeichert.
- `TestAPIKey_Auth`: Gültiger Key → authentifiziert.
- `TestAPIKey_Revoked`: Widerrufener Key → 401.
- `TestAPIKey_ReadOnly`: Read-Key → POST/PATCH → 403.
- `TestWebhook_Trigger`: Event → HTTP POST an URL.
- `TestWebhook_HMAC`: Signatur korrekt berechnet.
- `TestWebhook_Retry`: 1. Fehler → Retry nach 1min.
- `TestWebhook_Deactivate`: 3 Fehler → deaktiviert.
- `TestRateLimit_Exceeded`: >60 Requests/min → 429.

### API Tests
- `TestAPIKeyHandler_Create_201`, `TestAPIKeyHandler_Delete_200`, `TestWebhookHandler_CRUD`, `TestWebhookHandler_Test_200`

## Verification Checklist
- [ ] Migration: api_keys, webhooks
- [ ] Key-Generierung mit Hash
- [ ] Key nur einmal sichtbar
- [ ] Auth-Middleware für API-Keys
- [ ] Webhook Event-System
- [ ] HMAC-Signatur
- [ ] Retry mit Backoff
- [ ] Rate-Limiting
- [ ] Alle Tests bestehen

## Dependencies
- Keine harten Abhängigkeiten (kann eigenständig implementiert werden)
