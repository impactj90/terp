# ZMI-TICKET-123: Dokumenten-Editor — Workflow (Entwurf → Fertigstellen → Versand)

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 3 — Nummernkreise & Dokumenten-Engine
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.3 Dokumenten-Workflow
Blocked by: ZMI-TICKET-121, ZMI-TICKET-120
Blocks: ZMI-TICKET-124, ZMI-TICKET-130

## Goal
Vollständigen Dokumenten-Workflow implementieren: Entwurf → Vorschau → Fertigstellen (Nummernvergabe) → Versand → Zahlung. Inklusive Erneut-Bearbeiten, Stornierung und Locking bei gleichzeitiger Bearbeitung. Der Workflow stellt sicher, dass nur fertiggestellte Dokumente Nummern erhalten und die steuerrechtlichen Anforderungen (§14 UStG) erfüllt werden.

## Scope
- **In scope:** Status-Workflow-Engine, Fertigstellung mit Nummernvergabe, Erneut-Bearbeiten (Entsperrung), Stornierung, Concurrent-Edit-Locking, Audit-Trail für Statusänderungen, Dokument-Validierung vor Fertigstellung.
- **Out of scope:** PDF-Generierung (ZMI-TICKET-140), E-Mail-Versand (ZMI-TICKET-141), Zahlungen (ZMI-TICKET-132+), Frontend UI (ZMI-TICKET-124).

## Requirements

### Status-Workflow

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
  [draft] ──→ [finalized] ──→ [sent] ──→ [paid]  │
     │              │             │                │
     │              │             └──→ [overdue]   │
     │              │                              │
     │              └──→ [reopened] ───────────────┘
     │                    (back to draft)
     │
     └──→ [cancelled]

  [finalized] ──→ [cancelled] (mit Storno-Dokument)
```

#### Status-Übergänge

| Von | Nach | Bedingung | Aktion |
|-----|------|-----------|--------|
| draft | finalized | Validierung bestanden | Nummernvergabe, finalized_at/by, Dokument gesperrt |
| draft | cancelled | — | Soft-Delete, keine Nummer |
| finalized | sent | Versand-Info vorhanden | sent_at setzen |
| finalized | reopened/draft | Keine Zahlungen zugeordnet | Warnung, Dokument entsperrt, Nummer bleibt |
| finalized | cancelled | — | Storno-Dokument erstellen, Audit-Trail |
| sent | paid | Zahlung vollständig | — |
| sent | overdue | Zahlungsziel überschritten | Automatisch (Cronjob/Check) |
| sent | reopened/draft | Keine Zahlungen | Warnung, Entsperrung |

### Fertigstellung (Finalize)

Bei Fertigstellung eines Dokuments:

1. **Validierung** (alle Checks müssen bestehen):
   - Mindestens 1 Position vorhanden (Warnung bei 0, kein harter Error)
   - Dokumentdatum gesetzt (Default: heute)
   - Kontakt zugeordnet (bei Rechnungen Pflicht, bei Angeboten optional)
   - Bei Rechnungen: Pflichtfelder nach §14 UStG vorhanden (Unternehmensdaten, Steuernummer)
   - Summen > 0 (Warnung bei 0, kein harter Error)

2. **Nummernvergabe:**
   - AllocateNext aus Nummernkreis-Service (ZMI-TICKET-120)
   - document_number wird gesetzt
   - Nummer ist ab jetzt unveränderlich

3. **Sperre:**
   - Dokument ist für Bearbeitung gesperrt
   - Nur Statusänderungen möglich
   - finalized_at und finalized_by werden gesetzt

4. **PDF-Generierung** (Zukunft, ZMI-TICKET-140):
   - Trigger-Event: `document.finalized`
   - Wird asynchron generiert

### Erneut Bearbeiten (Reopen)

Bedingungen:
- Keine Zahlungen zugeordnet
- Warnung: "Das Dokument wurde bereits fertiggestellt. Die Nummer bleibt bestehen."

Ablauf:
1. Status → draft
2. Dokument ist wieder bearbeitbar
3. document_number bleibt erhalten
4. Bei erneutem Fertigstellen → kein neuer Nummernkreis-Wert, gleiche Nummer
5. Neues PDF wird bei erneutem Fertigstellen generiert

### Stornierung (Cancel)

Für Entwürfe:
- Direkt löschbar (Soft-Delete), keine weitere Aktion

Für fertiggestellte Dokumente:
- Storno-Dokument wird erstellt (Referenz auf Original)
- Original-Status → cancelled
- Audit-Trail-Eintrag
- Bei Rechnungen: Gutschrift erstellen (ZMI-TICKET-134, Zukunft)

### Concurrent Edit Locking

Problem: Zwei Benutzer bearbeiten gleichzeitig dasselbe Dokument.

Lösung: **Optimistic Locking mit Version-Counter**

1. `documents`-Tabelle bekommt Feld `version INT NOT NULL DEFAULT 1`
2. Jeder PATCH Request enthält `"version": N` (aktuelle Version des Clients)
3. UPDATE ... WHERE id = ? AND version = N → SET version = N+1
4. Wenn 0 Rows affected → 409 Conflict "Document was modified by another user"

### Audit-Trail

#### Tabelle `document_status_changes`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| from_status | VARCHAR(20) | NOT NULL | Vorheriger Status |
| to_status | VARCHAR(20) | NOT NULL | Neuer Status |
| changed_by | UUID | FK users, NOT NULL | |
| changed_at | TIMESTAMPTZ | NOT NULL | |
| reason | TEXT | NULL | Optionaler Grund (z.B. bei Stornierung) |
| metadata | JSONB | NULL | Zusätzliche Daten (z.B. Storno-Dokument-ID) |

### Validierung vor Fertigstellung

#### Validierungs-Response
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "code": "EMPTY_DOCUMENT",
      "message": "Das Dokument enthält keine Positionen.",
      "severity": "warning"
    }
  ]
}
```

| Check | Severity | Beschreibung |
|-------|----------|-------------|
| Keine Positionen | warning | Erlaubt, aber Warnung |
| Summe = 0 | warning | Erlaubt, aber Warnung |
| Kein Kontakt (bei Rechnung) | error | Pflicht bei Rechnungen |
| Kein Dokumentdatum | error | Wird auf heute gesetzt |
| Fehlende Unternehmensdaten | error | Bei Rechnungen: §14 UStG |
| Ungültiger MwSt-Satz | error | 0%, 7%, 19% erlaubt (konfigurierbar) |
| Alternativposition als einzige | warning | Nur Alternativpositionen → Summe=0 |

### Business Rules

1. **Nummernvergabe ist atomar mit Fertigstellung.** Beides in einer Transaktion.
2. **Nummer bleibt bei Wiederöffnung.** Einmal vergeben, immer zugeordnet.
3. **Nur eine aktive Bearbeitungssession.** Optimistic Locking verhindert verlorene Updates.
4. **Stornierte Dokumente können nicht reaktiviert werden.**
5. **Nummernkreis-Korrektur:** Wenn der Nummernkreis nach Fertigstellung als falsch erkannt wird → Nummernkreis-Einstellung korrigierbar, aber die bereits vergebene Nummer des Dokuments bleibt bestehen.
6. **Briefpapier-Änderung:** Wenn das Briefpapier nach Fertigstellung geändert wird → Bereits generierte PDFs bleiben unverändert. Neues PDF nur bei Wiederöffnung + erneutem Fertigstellen.
7. **Event-System:** Statusänderungen emittieren Events (für zukünftige Integrationen: PDF-Gen, E-Mail, Webhooks).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{id}/finalize | Dokument fertigstellen |
| POST | /documents/{id}/reopen | Dokument erneut bearbeiten |
| POST | /documents/{id}/cancel | Dokument stornieren |
| POST | /documents/{id}/mark-sent | Als versendet markieren |
| GET | /documents/{id}/validate | Validierung vor Fertigstellung |
| GET | /documents/{id}/status-history | Audit-Trail der Statusänderungen |

#### POST /documents/{id}/finalize Request
```json
{
  "document_date": "2026-03-18",
  "force": false
}
```
`force: true` überspringt Warnungen (nicht Errors).

#### POST /documents/{id}/finalize Response
```json
{
  "id": "...",
  "document_number": "RE-2026-0042",
  "status": "finalized",
  "finalized_at": "2026-03-18T14:30:00Z",
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

#### POST /documents/{id}/cancel Request
```json
{
  "reason": "Kunde hat Auftrag zurückgezogen"
}
```

#### POST /documents/{id}/reopen Response
```json
{
  "id": "...",
  "status": "draft",
  "document_number": "RE-2026-0042",
  "warning": "Das Dokument wurde bereits fertiggestellt. Die Nummer bleibt bestehen. Bei erneutem Fertigstellen wird ein neues PDF generiert."
}
```

### Permissions
- `documents.finalize` — Dokumente fertigstellen
- `documents.reopen` — Fertiggestellte Dokumente erneut bearbeiten
- `documents.cancel` — Dokumente stornieren

### Service-Interface

```go
type DocumentWorkflowService interface {
    Validate(ctx context.Context, tenantID, docID uuid.UUID) (*ValidationResult, error)
    Finalize(ctx context.Context, tenantID, docID uuid.UUID, input FinalizeInput) (*Document, error)
    Reopen(ctx context.Context, tenantID, docID uuid.UUID) (*Document, error)
    Cancel(ctx context.Context, tenantID, docID uuid.UUID, reason string) (*Document, error)
    MarkSent(ctx context.Context, tenantID, docID uuid.UUID, sentAt time.Time) (*Document, error)
    GetStatusHistory(ctx context.Context, tenantID, docID uuid.UUID) ([]StatusChange, error)
}
```

## Acceptance Criteria
1. Dokument kann von draft → finalized überführt werden.
2. Bei Fertigstellung wird Nummer aus Nummernkreis vergeben (atomar).
3. Fertiggestelltes Dokument ist für Bearbeitung gesperrt.
4. Erneut-Bearbeiten funktioniert wenn keine Zahlungen zugeordnet.
5. Nummer bleibt bei Wiederöffnung bestehen.
6. Stornierung erstellt Audit-Trail-Eintrag.
7. Validierung prüft alle Pflichtfelder (Errors vs. Warnings).
8. Optimistic Locking verhindert gleichzeitige Updates (409 Conflict).
9. Audit-Trail protokolliert alle Statusänderungen.
10. Event-System emittiert Events bei Statusänderungen.
11. Permissions werden durchgesetzt.

## Tests

### Unit Tests — Service

#### Fertigstellung
- `TestWorkflow_Finalize_Success`: Draft → Finalized, Nummer vergeben.
- `TestWorkflow_Finalize_SetsDate`: document_date=null → wird auf heute gesetzt.
- `TestWorkflow_Finalize_CustomDate`: document_date=2026-03-15 → wird übernommen.
- `TestWorkflow_Finalize_AlreadyFinalized`: Bereits finalized → Error "already finalized".
- `TestWorkflow_Finalize_Cancelled`: Cancelled → Error "cannot finalize cancelled document".
- `TestWorkflow_Finalize_WithWarnings_NoForce`: Warnungen + force=false → Error mit Warnungen.
- `TestWorkflow_Finalize_WithWarnings_Force`: Warnungen + force=true → OK.
- `TestWorkflow_Finalize_WithErrors`: Pflichtfeld fehlt → Error (auch mit force).
- `TestWorkflow_Finalize_AtomicWithNumber`: Nummer wird in gleicher Transaktion vergeben.
- `TestWorkflow_Finalize_CreatesAuditEntry`: StatusChange draft→finalized wird erstellt.

#### Validierung
- `TestWorkflow_Validate_ValidDocument`: Alles OK → valid=true, keine Errors/Warnings.
- `TestWorkflow_Validate_NoPositions`: 0 Positionen → warning EMPTY_DOCUMENT.
- `TestWorkflow_Validate_ZeroSum`: Summe=0 → warning ZERO_TOTAL.
- `TestWorkflow_Validate_NoContact_Offer`: Angebot ohne Kontakt → OK (kein Error).
- `TestWorkflow_Validate_NoContact_Invoice`: Rechnung ohne Kontakt → error MISSING_CONTACT.
- `TestWorkflow_Validate_MissingCompanyData`: Fehlende Unternehmensdaten → error bei Rechnung.
- `TestWorkflow_Validate_OnlyAlternatives`: Nur Alternativpositionen → warning.

#### Erneut Bearbeiten
- `TestWorkflow_Reopen_Success`: Finalized → Draft, Nummer bleibt.
- `TestWorkflow_Reopen_WithPayments`: Zahlung zugeordnet → Error "cannot reopen with payments".
- `TestWorkflow_Reopen_Draft`: Bereits Draft → Error "already draft".
- `TestWorkflow_Reopen_Cancelled`: Cancelled → Error "cannot reopen cancelled".
- `TestWorkflow_Reopen_CreatesAuditEntry`: StatusChange finalized→draft.

#### Stornierung
- `TestWorkflow_Cancel_Draft`: Draft stornieren → Soft-Delete.
- `TestWorkflow_Cancel_Finalized`: Finalized stornieren → cancelled, Audit-Eintrag mit Grund.
- `TestWorkflow_Cancel_AlreadyCancelled`: Bereits cancelled → Error.
- `TestWorkflow_Cancel_WithReason`: Grund wird im Audit-Trail gespeichert.

#### Optimistic Locking
- `TestWorkflow_OptimisticLock_Success`: Version stimmt → Update OK.
- `TestWorkflow_OptimisticLock_Conflict`: Version stimmt nicht → 409 Conflict.
- `TestWorkflow_OptimisticLock_VersionIncremented`: Nach Update → version + 1.

#### Audit-Trail
- `TestWorkflow_AuditTrail_FinalizeRecorded`: Finalize → Eintrag mit User und Zeitstempel.
- `TestWorkflow_AuditTrail_ReopenRecorded`: Reopen → Eintrag.
- `TestWorkflow_AuditTrail_CancelRecorded`: Cancel → Eintrag mit Reason.
- `TestWorkflow_AuditTrail_FullHistory`: Mehrere Statusänderungen → chronologische Liste.

### API Tests — Handler

- `TestWorkflowHandler_Finalize_200`: Erfolgreiche Fertigstellung.
- `TestWorkflowHandler_Finalize_200_WithNumber`: Response enthält document_number.
- `TestWorkflowHandler_Finalize_400_ValidationErrors`: Pflichtfelder fehlen → 400 mit Fehlern.
- `TestWorkflowHandler_Finalize_409_AlreadyFinalized`: Bereits fertig → 409.
- `TestWorkflowHandler_Finalize_403`: Ohne documents.finalize → 403.
- `TestWorkflowHandler_Reopen_200`: Erfolgreiche Wiederöffnung.
- `TestWorkflowHandler_Reopen_409_HasPayments`: Mit Zahlungen → 409.
- `TestWorkflowHandler_Reopen_403`: Ohne documents.reopen → 403.
- `TestWorkflowHandler_Cancel_200`: Stornierung mit Grund.
- `TestWorkflowHandler_Cancel_403`: Ohne documents.cancel → 403.
- `TestWorkflowHandler_MarkSent_200`: Als versendet markieren.
- `TestWorkflowHandler_Validate_200`: Validierungs-Response.
- `TestWorkflowHandler_StatusHistory_200`: Audit-Trail abrufen.
- `TestWorkflowHandler_OptimisticLock_409`: Version Conflict.
- `TestWorkflowHandler_TenantIsolation`: Fremder Tenant → 404.

### Integration Tests

- `TestWorkflow_FullLifecycle`: Create → Add Items → Validate → Finalize → Mark Sent → Verify Audit Trail.
- `TestWorkflow_ReopenAndRefinalize`: Create → Finalize → Reopen → Edit → Finalize → Same Number.
- `TestWorkflow_ConcurrentFinalize`: 2 gleichzeitige Finalize-Requests → nur einer bekommt Nummer.
- `TestWorkflow_NumberSequenceIntegration`: Finalize → Nummer aus korrektem Nummernkreis.
- `TestWorkflow_StornoCycle`: Finalize → Cancel → Verify Audit Trail und Status.

### Test Case Pack

1) **Standard-Fertigstellung**
   - Setup: Dokument mit 3 Positionen, Kontakt gesetzt
   - Action: POST /finalize
   - Expected: status=finalized, document_number="AN-2026-0001"

2) **Fertigstellung mit Warnungen**
   - Setup: Dokument ohne Positionen
   - Action: POST /finalize {force: false}
   - Expected: 400 mit warning EMPTY_DOCUMENT
   - Action: POST /finalize {force: true}
   - Expected: 200, status=finalized

3) **Rechnung ohne Kontakt**
   - Setup: Rechnung, kein contact_id
   - Action: POST /finalize
   - Expected: 400, error MISSING_CONTACT

4) **Wiederöffnung und Re-Finalisierung**
   - Setup: Fertiggestelltes Angebot AN-2026-0001
   - Action: POST /reopen → PATCH (Preis ändern) → POST /finalize
   - Expected: Nummer bleibt AN-2026-0001, Summen aktualisiert

5) **Concurrent Edit**
   - Setup: Dokument version=3
   - Action: User A: PATCH {version:3, title:"A"} (erfolgreich, version→4)
   - Action: User B: PATCH {version:3, title:"B"}
   - Expected: User B → 409 Conflict

6) **Stornierung fertiggestelltes Dokument**
   - Setup: Rechnung RE-2026-0005, finalized
   - Action: POST /cancel {reason: "Kunde storniert"}
   - Expected: status=cancelled, Audit-Trail mit Grund

7) **Wiederöffnung mit Zahlung**
   - Setup: Rechnung mit zugeordneter Zahlung
   - Action: POST /reopen
   - Expected: 409 "cannot reopen document with payments"

## Verification Checklist
- [ ] Migration: `version` Feld auf documents Tabelle hinzugefügt
- [ ] Migration: `document_status_changes` Tabelle erstellt
- [ ] Migration reversibel (DOWN)
- [ ] Status-Übergänge durchgesetzt (nur erlaubte Transitionen)
- [ ] Fertigstellung vergibt Nummer atomar (eine Transaktion)
- [ ] Fertigstellung sperrt Dokument für Bearbeitung
- [ ] Erneut-Bearbeiten nur ohne Zahlungen
- [ ] Nummer bleibt bei Wiederöffnung
- [ ] Stornierung erstellt Audit-Trail
- [ ] Optimistic Locking mit Version-Counter
- [ ] 409 Conflict bei Version-Mismatch
- [ ] Validierung: Errors blockieren, Warnings überspringbar
- [ ] Validierung: Kontakt-Pflicht bei Rechnungen
- [ ] Audit-Trail: Alle Statusänderungen protokolliert
- [ ] Audit-Trail: User, Zeitstempel, Grund
- [ ] Event-System: Events bei Statusänderungen
- [ ] Permissions: finalize, reopen, cancel separat
- [ ] Tenant-Isolation
- [ ] API Responses matchen OpenAPI-Spec
- [ ] `make lint` keine neuen Issues
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell)
- ZMI-TICKET-120 (Nummernkreise — für Nummernvergabe bei Fertigstellung)
- ZMI-TICKET-107 (Unternehmensdaten — für Validierung §14 UStG)

## Notes
- Der Workflow ist bewusst einfach gehalten. Komplexere Workflows (Genehmigungen, mehrstufige Freigabe) können später ergänzt werden.
- Die `version`-Spalte für Optimistic Locking ist einfacher als Advisory Locks und reicht für die erwartete Nutzung.
- Events (document.finalized, document.cancelled, etc.) werden zunächst als Go-Interface definiert. Die konkrete Implementierung (Channel, Queue, etc.) wird bei Bedarf entschieden.
- Die Validierung vor Fertigstellung ist modular aufgebaut: Jeder Check ist eine eigene Funktion, neue Checks können einfach hinzugefügt werden.
- Für die Zukunft: Wenn PDF-Generierung implementiert wird, wird sie als Event-Handler an document.finalized angehängt.
