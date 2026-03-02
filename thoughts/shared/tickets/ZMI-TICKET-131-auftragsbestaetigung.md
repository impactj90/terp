# ZMI-TICKET-131: Auftragsbestätigung — Generierung aus Angebot

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 4 — Auftragsdokumente
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.1 Dokumententypen (Auftragsbestätigung)
Blocked by: ZMI-TICKET-130
Blocks: ZMI-TICKET-132, ZMI-TICKET-172

## Goal
Auftragsbestätigungen (AB) als Dokumententyp mit spezifischer Geschäftslogik implementieren. ABs werden primär aus angenommenen Angeboten generiert, können aber auch eigenständig erstellt werden. Bei Fertigstellung einer AB werden automatisch Arbeitsanweisungen und Materiallisten generiert (Zukunft).

## Scope
- **In scope:** AB-spezifische Logik, Generierung aus Angebot, eigenständige Erstellung, Auftragsstatus-Tracking, Verknüpfung mit Projekt.
- **Out of scope:** Arbeitsanweisungen-Generierung (ZMI-TICKET-172), PDF (ZMI-TICKET-140).

## Requirements

### AB-spezifische Geschäftslogik

1. **Generierung aus Angebot:**
   - Alle Normalpositionen + Kalkulation werden kopiert
   - Alternativpositionen werden NICHT kopiert
   - Bedarfspositionen werden mit Menge=0 kopiert
   - `source_document_id` zeigt auf Angebot
   - Einleitungstext wird auf AB-Standard geändert (konfigurierbar)

2. **Eigenständige Erstellung:**
   - Blanko-AB ohne Angebot-Referenz
   - Aus GAEB-Import (Zukunft, ZMI-TICKET-180)
   - Aus Excel-Import (Zukunft)

3. **Auftragsstatus:**
   - AB-Fertigstellung → Projekt-Status kann auf `in_progress` gesetzt werden (optional, konfigurierbar)
   - Verknüpfung mit Projekt: Wenn Angebot ein Projekt hatte → AB erbt Projektzuordnung

4. **Weiterführende Dokumente:**
   - AB → Rechnung (Konvertierung)
   - AB → Abschlagsrechnung (Serie starten)
   - AB → Lieferschein

### Business Rules
1. Eine AB kann nur aus einem angenommenen Angebot generiert werden (oder eigenständig).
2. Mehrere ABs können aus demselben Angebot erstellt werden (z.B. bei Änderungen).
3. Die letzte AB eines Projekts gilt als "aktive" Auftragsgrundlage.
4. AB-Fertigstellung triggert Event `order_confirmation.finalized` (für Arbeitsanweisungen).

### API / OpenAPI
Die AB nutzt die bestehende Dokumenten-API (ZMI-TICKET-121, 123) mit `document_type=order_confirmation`. Zusätzlich:

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{offerId}/create-confirmation | AB aus Angebot generieren |

### Permissions
- `documents.create` — (existiert) AB erstellen
- `documents.finalize` — (existiert) AB fertigstellen

## Acceptance Criteria
1. AB aus Angebot generierbar (ohne Alternativpositionen).
2. Eigenständige AB-Erstellung möglich.
3. Kalkulation wird bei Generierung mitkopiert.
4. source_document_id korrekt gesetzt.
5. Projektzuordnung wird vererbt.
6. Event bei Fertigstellung emittiert.

## Tests

### Unit Tests
- `TestAB_GenerateFromOffer`: Angebot → AB, alle Normalpositionen kopiert.
- `TestAB_GenerateFromOffer_NoAlternatives`: Alternativpositionen gefiltert.
- `TestAB_GenerateFromOffer_DemandZero`: Bedarfspositionen mit Menge=0.
- `TestAB_GenerateFromOffer_CalcCopied`: Kalkulation wird mitkopiert.
- `TestAB_GenerateFromOffer_ProjectInherited`: Projekt-ID vererbt.
- `TestAB_GenerateFromOffer_TextChanged`: Einleitungstext = AB-Standard.
- `TestAB_GenerateFromOffer_NotAccepted`: Angebot nicht accepted → Error.
- `TestAB_Standalone`: Eigenständige AB ohne source_document_id.
- `TestAB_Finalize_EmitsEvent`: Fertigstellung → Event emittiert.

### API Tests
- `TestABHandler_CreateFromOffer_201`: AB aus Angebot.
- `TestABHandler_CreateFromOffer_409_NotAccepted`: Angebot nicht accepted → 409.
- `TestABHandler_CreateStandalone_201`: Eigenständige AB.
- `TestABHandler_TenantIsolation`: Fremdes Angebot → 404.

### Integration Tests
- `TestAB_FullFlow`: Angebot erstellen → Fertigstellen → Annehmen → AB generieren → AB fertigstellen.
- `TestAB_MultipleFromSameOffer`: 2 ABs aus einem Angebot → beide referenzieren gleiche source.

### Test Case Pack
1) **AB aus Angebot**: Angebot (3 Normal + 1 Alternativ) → AB hat 3 Positionen.
2) **Eigenständige AB**: Blank AB → Positionen manuell → Fertigstellen.
3) **Kalkulations-Übernahme**: Angebot mit Tiefenkalkulation → AB hat gleiche Kalkulation.

## Verification Checklist
- [ ] AB-Generierung aus Angebot funktioniert
- [ ] Alternativpositionen korrekt gefiltert
- [ ] Kalkulation wird mitkopiert
- [ ] source_document_id gesetzt
- [ ] Projekt-ID vererbt
- [ ] Eigenständige Erstellung möglich
- [ ] Event bei Fertigstellung
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen
- [ ] `make lint` keine neuen Issues

## Dependencies
- ZMI-TICKET-130 (Angebote)
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell)
- ZMI-TICKET-123 (Dokumenten-Workflow)

## Notes
- Die AB ist im Handwerk der "Startschuss" für das Projekt. Sie löst die Materialbeschaffung und Arbeitszuweisung aus.
- Arbeitsanweisungen und Materiallisten (ZMI-TICKET-172) werden als Event-Handler an die AB-Fertigstellung angehängt.
