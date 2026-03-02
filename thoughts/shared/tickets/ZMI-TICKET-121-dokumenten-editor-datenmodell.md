# ZMI-TICKET-121: Dokumenten-Editor — Datenmodell (Positionen, Titel, Hierarchie)

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 3 — Nummernkreise & Dokumenten-Engine
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.1 Dokumententypen, 3.2 Dokumenten-Editor
Blocked by: ZMI-TICKET-104
Blocks: ZMI-TICKET-122, ZMI-TICKET-123, ZMI-TICKET-124, ZMI-TICKET-130

## Goal
Zentrales Datenmodell für alle Auftragsdokumente (Angebote, Auftragsbestätigungen, Rechnungen, etc.). Ein Dokument besteht aus einer hierarchischen Struktur von Titeln, Untertiteln und Positionen. Das Modell muss flexibel genug sein, um alle Dokumententypen abzubilden und gleichzeitig die Grundlage für Kalkulation, PDF-Generierung und Dokumenten-Workflow zu bilden.

## Scope
- **In scope:** Datenmodell (documents, document_items), CRUD-Operationen, Positionstypen (Normal, Alternativ, Bedarf, Text, Pauschal), hierarchische Struktur (Titel → Untertitel → Position), Sortierung, Drag & Drop Reihenfolge-API, Summenberechnung (Netto/MwSt/Brutto), Dokument-Kopieren/Klonen.
- **Out of scope:** Tiefenkalkulation (ZMI-TICKET-122), Workflow/Status (ZMI-TICKET-123), Frontend UI (ZMI-TICKET-124), spezifische Dokumententypen wie Abschlagsrechnungen (ZMI-TICKET-133).

## Requirements

### Datenmodell

#### Tabelle `documents`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NULL | Projektzuordnung (optional bei Erstellung) |
| contact_id | UUID | FK contacts, NULL | Kunde/Empfänger |
| document_type | VARCHAR(30) | NOT NULL | 'offer', 'order_confirmation', 'invoice', 'partial_invoice', 'final_invoice', 'delivery_note', 'credit_note' |
| document_number | VARCHAR(50) | NULL | Erst bei Fertigstellung vergeben (aus Nummernkreis) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | 'draft', 'finalized', 'sent', 'accepted', 'rejected', 'cancelled' |
| title | VARCHAR(255) | | Dokumenttitel (z.B. "Angebot Malerarbeiten Müller") |
| introduction_text | TEXT | | Einleitungstext vor Positionen |
| closing_text | TEXT | | Schlusstext nach Positionen |
| document_date | DATE | | Dokumentdatum (Default: Fertigstellungsdatum) |
| valid_until | DATE | NULL | Gültigkeitsdatum (nur bei Angeboten) |
| delivery_date | DATE | NULL | Liefer-/Leistungsdatum |
| payment_terms_text | TEXT | | Zahlungsbedingungen-Text |
| payment_days | INT | NULL | Zahlungsziel in Tagen |
| discount_percent | DECIMAL(5,2) | NULL | Skonto-Prozentsatz |
| discount_days | INT | NULL | Skonto-Frist in Tagen |
| default_vat_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 19.00 | Standard-MwSt-Satz |
| net_total | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | Netto-Gesamtsumme (berechnet) |
| vat_total | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | MwSt-Gesamtsumme (berechnet) |
| gross_total | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | Brutto-Gesamtsumme (berechnet) |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'EUR' | Währung |
| notes | TEXT | | Interne Notizen (nicht auf Dokument) |
| source_document_id | UUID | FK documents, NULL | Ursprungsdokument (z.B. Angebot → Auftragsbestätigung) |
| pdf_file_id | UUID | FK project_files, NULL | Generiertes PDF |
| finalized_at | TIMESTAMPTZ | NULL | Zeitpunkt der Fertigstellung |
| finalized_by | UUID | FK users, NULL | |
| sent_at | TIMESTAMPTZ | NULL | Zeitpunkt des Versands |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |
| updated_by | UUID | FK users | |
| deleted_at | TIMESTAMPTZ | NULL | Soft-Delete |

**Constraints:**
- UNIQUE (tenant_id, document_number) WHERE document_number IS NOT NULL
- INDEX (tenant_id, document_type, status)
- INDEX (tenant_id, project_id)
- INDEX (tenant_id, contact_id)

#### Tabelle `document_items`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL, ON DELETE CASCADE | |
| tenant_id | UUID | FK tenants, NOT NULL | Denormalisiert für Partitioning/Queries |
| parent_id | UUID | FK document_items, NULL | Übergeordneter Titel/Untertitel (NULL = Root-Level) |
| item_type | VARCHAR(20) | NOT NULL | 'title', 'subtitle', 'position', 'text', 'page_break' |
| position_type | VARCHAR(20) | NULL | Nur bei item_type='position': 'normal', 'alternative', 'demand', 'flat_rate' |
| position_number | VARCHAR(20) | | Positionsnummer (z.B. "1.1", "2.3.1") — auto-generiert |
| article_id | UUID | FK articles, NULL | Verknüpfung zum Artikelstamm (Snapshot bei Übernahme) |
| short_text | VARCHAR(500) | | Kurztext (Positionsbezeichnung oder Titeltext) |
| long_text | TEXT | | Langtext/Beschreibung |
| unit | VARCHAR(20) | | Einheit (Stk, m, m², etc.) |
| quantity | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Menge |
| unit_price | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Einzelpreis (EP) netto |
| total_price | DECIMAL(14,2) | NOT NULL, DEFAULT 0 | Gesamtpreis (GP = Menge × EP) |
| pricing_mode | VARCHAR(20) | NOT NULL, DEFAULT 'unit' | 'unit' (EP × Menge) oder 'total' (GP direkt, EP rückgerechnet) |
| vat_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 19.00 | MwSt-Satz dieser Position |
| discount_percent | DECIMAL(5,2) | NOT NULL, DEFAULT 0 | Positionsrabatt |
| is_optional | BOOLEAN | NOT NULL, DEFAULT false | Alternative/optionale Position (nicht in Summe) |
| sort_order | INT | NOT NULL, DEFAULT 0 | Reihenfolge innerhalb der Ebene |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraints:**
- INDEX (document_id, parent_id, sort_order) für schnelle hierarchische Queries
- INDEX (tenant_id, article_id) für Artikel-Referenz-Lookup

#### Tabelle `document_vat_summary`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL, ON DELETE CASCADE | |
| vat_rate | DECIMAL(5,2) | NOT NULL | MwSt-Satz (z.B. 19.00, 7.00) |
| net_amount | DECIMAL(14,2) | NOT NULL | Netto-Betrag für diesen Satz |
| vat_amount | DECIMAL(14,2) | NOT NULL | MwSt-Betrag |
| gross_amount | DECIMAL(14,2) | NOT NULL | Brutto-Betrag |

**Constraint:** UNIQUE (document_id, vat_rate)

### Positionstypen

| Typ | item_type | position_type | In Summe | Beschreibung |
|-----|-----------|---------------|----------|-------------|
| Titel | title | — | — | Gruppierung (z.B. "Malerarbeiten Erdgeschoss") |
| Untertitel | subtitle | — | — | Unter-Gruppierung |
| Normalposition | position | normal | Ja | Standard: Menge × EP = GP |
| Alternativposition | position | alternative | Nein | Optional, als Alternative markiert |
| Bedarfsposition | position | demand | Nein | Nur bei Bedarf abrufbar |
| Pauschalposition | position | flat_rate | Ja | Menge=1, Einheit=psch. |
| Textposition | text | — | Nein | Nur beschreibender Text, kein Preis |
| Seitenumbruch | page_break | — | — | Erzwingt Seitenumbruch im PDF |

### Hierarchie-Regeln

1. **Maximale Tiefe:** 3 Ebenen (Titel → Untertitel → Position). Positionen können auch direkt unter einem Titel oder auf Root-Level liegen.
2. **Titel können nur Untertitel und Positionen enthalten.**
3. **Untertitel können nur Positionen enthalten.**
4. **Positionen und Text-Elemente sind immer Blätter (keine Kinder).**
5. **Position-Nummern werden automatisch generiert** basierend auf der Hierarchie (1, 1.1, 1.1.1, 2, 2.1, etc.).

### Summenberechnung

```
Für jede Position (position_type != 'alternative' && position_type != 'demand' && !is_optional):
  GP = Menge × EP × (1 - Rabatt/100)
  Gerundet auf 2 Dezimalstellen (kaufmännisch)

Titel-Summe = Summe aller GP der direkten und indirekten Kinder (nur zählbare Positionen)

Netto-Gesamt = Summe aller zählbaren GP
MwSt pro Satz = Summe der GP pro MwSt-Satz × (MwSt-Satz / 100)
Brutto-Gesamt = Netto-Gesamt + Summe aller MwSt
```

**Rundung:** Kaufmännische Rundung auf 2 Dezimalstellen. EP darf bis zu 4 Dezimalstellen haben, GP immer 2.

### Pricing Modes

- **Einheitspreisbasis (`unit`):** Benutzer gibt EP ein → GP = Menge × EP
- **Gesamtpreisbasis (`total`):** Benutzer gibt GP ein → EP = GP / Menge (rückgerechnet). Bei Menge=0 → Division durch Null verhindern → EP=0.

### Artikel-Übernahme

Beim Einfügen eines Artikels aus dem Artikelstamm in ein Dokument:
1. `article_id` wird gesetzt (Referenz).
2. Alle Felder werden als Snapshot kopiert (short_text, long_text, unit, unit_price=purchase_price oder sales_price).
3. Nachträgliche Änderungen am Artikel ändern NICHT das Dokument.
4. Benutzer kann alle kopierten Werte im Dokument überschreiben.

### Business Rules

1. **Entwürfe sind frei bearbeitbar.** Keine Einschränkungen.
2. **Fertiggestellte Dokumente sind gesperrt.** Nur erneut bearbeiten (Entsperrung) möglich wenn keine Zahlung zugeordnet.
3. **Summen werden bei jeder Änderung neuberechnet** und auf dem Dokument gespeichert (denormalisiert für Performance).
4. **Dokument mit 0 Positionen fertigstellen:** Erlaubt mit Warnung.
5. **Kopieren/Klonen:** Erstellt ein neues Dokument (draft) mit allen Items. source_document_id zeigt auf das Original.
6. **Dokumententyp-Konvertierung:** Angebot → Auftragsbestätigung, Auftragsbestätigung → Rechnung. Erstellt neues Dokument mit Referenz.
7. **Soft-Delete:** Entwürfe können direkt gelöscht werden. Fertiggestellte nur mit Warnung und Audit-Trail.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /documents | Dokumente auflisten (Filter: type, status, project_id, contact_id) |
| POST | /documents | Neues Dokument erstellen |
| GET | /documents/{id} | Dokument mit allen Items abrufen |
| PATCH | /documents/{id} | Dokument-Header aktualisieren |
| DELETE | /documents/{id} | Dokument löschen (Soft-Delete) |
| POST | /documents/{id}/clone | Dokument kopieren |
| POST | /documents/{id}/convert | Dokument in anderen Typ konvertieren |
| GET | /documents/{id}/items | Alle Items hierarchisch |
| POST | /documents/{id}/items | Item hinzufügen |
| PATCH | /documents/{id}/items/{itemId} | Item aktualisieren |
| DELETE | /documents/{id}/items/{itemId} | Item löschen (mit Kindern) |
| POST | /documents/{id}/items/reorder | Items neu sortieren |
| POST | /documents/{id}/items/from-article | Artikel aus Stamm einfügen |
| GET | /documents/{id}/summary | Summierung (Netto, MwSt-Aufschlüsselung, Brutto) |

#### POST /documents Request
```json
{
  "document_type": "offer",
  "project_id": "...",
  "contact_id": "...",
  "title": "Angebot Malerarbeiten Müller",
  "introduction_text": "Sehr geehrter Herr Müller,\nwir erlauben uns folgendes Angebot...",
  "default_vat_rate": 19.00
}
```

#### POST /documents/{id}/items Request (Position)
```json
{
  "parent_id": "...",
  "item_type": "position",
  "position_type": "normal",
  "short_text": "Wand streichen, 2x Anstrich",
  "long_text": "Innenwand streichen mit hochwertiger Dispersionsfarbe...",
  "unit": "m²",
  "quantity": 85.5,
  "unit_price": 15.23,
  "vat_rate": 19.00
}
```

#### POST /documents/{id}/items/reorder Request
```json
{
  "items": [
    { "id": "item-uuid-1", "parent_id": null, "sort_order": 0 },
    { "id": "item-uuid-2", "parent_id": "item-uuid-1", "sort_order": 0 },
    { "id": "item-uuid-3", "parent_id": "item-uuid-1", "sort_order": 1 }
  ]
}
```

#### POST /documents/{id}/convert Request
```json
{
  "target_type": "order_confirmation"
}
```

### Permissions
- `documents.view` — Dokumente anzeigen
- `documents.create` — Dokumente erstellen
- `documents.edit` — Dokumente bearbeiten
- `documents.delete` — Dokumente löschen

## Acceptance Criteria
1. Dokumente mit hierarchischen Positionen (Titel → Untertitel → Position) erstell- und bearbeitbar.
2. Alle 5 Positionstypen funktionieren (Normal, Alternativ, Bedarf, Pauschal, Text).
3. Summenberechnung korrekt (Netto/MwSt/Brutto) mit korrekter Rundung.
4. Positionsnummern werden automatisch generiert (1, 1.1, 1.1.2, 2, ...).
5. Drag & Drop Reorder-API funktioniert mit Hierarchie-Wechsel.
6. Artikel-Übernahme aus Stamm mit Snapshot.
7. Dokument-Klonen erstellt vollständige Kopie als Entwurf.
8. Dokument-Konvertierung (Angebot → AB) mit Referenz.
9. MwSt-Aufschlüsselung bei gemischten Sätzen (19% + 7%).
10. Pricing-Modes (unit + total) funktionieren.
11. Soft-Delete mit korrektem Verhalten (Entwürfe vs. Finalisierte).
12. Tenant-Isolation gewährleistet.

## Tests

### Unit Tests — Service

#### Summenberechnung
- `TestDocument_CalcTotals_SinglePosition`: 1 Position, 10 × 15.00 → net=150.00, vat=28.50, gross=178.50.
- `TestDocument_CalcTotals_MultiplePositions`: 3 Positionen → korrekte Summe.
- `TestDocument_CalcTotals_MixedVatRates`: Position A (19%), Position B (7%) → korrekte MwSt-Aufschlüsselung.
- `TestDocument_CalcTotals_WithDiscount`: Position mit 10% Rabatt → GP = Menge × EP × 0.9.
- `TestDocument_CalcTotals_AlternativeExcluded`: Alternativposition nicht in Summe enthalten.
- `TestDocument_CalcTotals_DemandExcluded`: Bedarfsposition nicht in Summe enthalten.
- `TestDocument_CalcTotals_FlatRate`: Pauschalposition Menge=1, psch. → korrekt.
- `TestDocument_CalcTotals_Rounding`: EP=1.005, Menge=3 → GP korrekt gerundet.
- `TestDocument_CalcTotals_EmptyDocument`: Keine Positionen → net=0, vat=0, gross=0.
- `TestDocument_CalcTotals_ZeroQuantity`: Menge=0 → GP=0.

#### Pricing Modes
- `TestDocument_PricingMode_Unit`: EP=15.23, Menge=10 → GP=152.30.
- `TestDocument_PricingMode_Total`: GP=152.30, Menge=10 → EP=15.23.
- `TestDocument_PricingMode_Total_ZeroQuantity`: GP=100, Menge=0 → EP=0 (keine Division durch Null).
- `TestDocument_PricingMode_Total_Rounding`: GP=100, Menge=3 → EP=33.3333 (4 Dezimalstellen).

#### Positionsnummern
- `TestDocument_PositionNumbers_Flat`: 3 Root-Positionen → "1", "2", "3".
- `TestDocument_PositionNumbers_Nested`: Titel(1) → Position(1.1, 1.2), Titel(2) → Position(2.1) → korrekte Nummerierung.
- `TestDocument_PositionNumbers_DeepNested`: Titel → Untertitel → Position → "1.1.1".
- `TestDocument_PositionNumbers_AfterReorder`: Reorder → Nummern werden neu vergeben.
- `TestDocument_PositionNumbers_TitlesNotNumbered`: Titel selbst bekommen Nummern aber keine Positionsnummern.
- `TestDocument_PositionNumbers_TextNotNumbered`: Textpositionen bekommen keine Nummer.

#### Hierarchie
- `TestDocument_Hierarchy_MaxDepth`: 4 Ebenen versuchen → Error "max depth 3 exceeded".
- `TestDocument_Hierarchy_PositionUnderPosition`: Position als Kind von Position → Error.
- `TestDocument_Hierarchy_TitleContainsTitle`: Titel unter Titel → Error (nur Untertitel erlaubt).
- `TestDocument_Hierarchy_DeleteTitle_CascadesChildren`: Titel löschen → alle Kinder auch gelöscht.
- `TestDocument_Hierarchy_MoveItem_UpdatesParent`: Item von Titel A nach Titel B verschieben.

#### Artikel-Übernahme
- `TestDocument_FromArticle_Snapshot`: Artikel einfügen → Felder kopiert, article_id gesetzt.
- `TestDocument_FromArticle_ArticleChanged`: Artikel nachträglich ändern → Dokument-Item unverändert.
- `TestDocument_FromArticle_SalesPrice`: Artikel mit sales_price → unit_price = sales_price.
- `TestDocument_FromArticle_SurchargePrice`: Artikel mit sales_price_mode=surcharge → unit_price aus Zuschlagsberechnung.
- `TestDocument_FromArticle_NotFound`: Unbekannter Artikel → 404.

#### Klonen & Konvertieren
- `TestDocument_Clone_CreatesNewDraft`: Klonen → neues Dokument mit status=draft, neuer ID, alle Items kopiert.
- `TestDocument_Clone_PreservesHierarchy`: Hierarchie bleibt erhalten nach Klonen.
- `TestDocument_Clone_NoDocumentNumber`: Klon hat keine document_number (ist Entwurf).
- `TestDocument_Convert_OfferToConfirmation`: Angebot → AB, source_document_id gesetzt.
- `TestDocument_Convert_ConfirmationToInvoice`: AB → Rechnung.
- `TestDocument_Convert_InvalidTransition`: Rechnung → Angebot → Error.

#### Soft-Delete
- `TestDocument_Delete_Draft`: Entwurf löschen → deleted_at gesetzt.
- `TestDocument_Delete_Finalized_Warning`: Fertiggestelltes Dokument → Warnung aber erlaubt.
- `TestDocument_Delete_WithPayment`: Dokument mit Zahlung → Error "cannot delete document with payments".

### API Tests — Handler

- `TestDocumentHandler_Create_201`: Neues Dokument erstellen.
- `TestDocumentHandler_Create_400_NoType`: Ohne document_type → 400.
- `TestDocumentHandler_List_200`: Dokumente auflisten mit Filtern.
- `TestDocumentHandler_List_200_FilterByType`: Nur Angebote → nur Angebote.
- `TestDocumentHandler_List_200_FilterByProject`: Nur Dokumente eines Projekts.
- `TestDocumentHandler_Get_200`: Dokument mit Items.
- `TestDocumentHandler_Get_404`: Unbekanntes Dokument.
- `TestDocumentHandler_Patch_200`: Header aktualisieren.
- `TestDocumentHandler_Patch_403_FinalizedWithoutPermission`: Finalisiert und bearbeiten → 403.
- `TestDocumentHandler_Delete_200`: Entwurf löschen.
- `TestDocumentHandler_Clone_201`: Klonen.
- `TestDocumentHandler_Convert_201`: Konvertieren.
- `TestDocumentHandler_Convert_400_InvalidTransition`: Ungültige Konvertierung.
- `TestDocumentHandler_AddItem_201`: Position hinzufügen, Summen aktualisiert.
- `TestDocumentHandler_AddItem_400_InvalidHierarchy`: Ungültige Hierarchie → 400.
- `TestDocumentHandler_UpdateItem_200`: Position aktualisieren, Summen neuberechnet.
- `TestDocumentHandler_DeleteItem_200`: Position löschen, Summen neuberechnet.
- `TestDocumentHandler_Reorder_200`: Items neu sortieren.
- `TestDocumentHandler_FromArticle_201`: Artikel aus Stamm einfügen.
- `TestDocumentHandler_Summary_200`: MwSt-Aufschlüsselung.
- `TestDocumentHandler_TenantIsolation`: Dokument von Tenant A nicht über Tenant B abrufbar.
- `TestDocumentHandler_Permissions_403`: Ohne documents.create → 403.

### Integration Tests

- `TestDocument_FullLifecycle`: Erstellen → Items hinzufügen → Summen prüfen → Klonen → Konvertieren.
- `TestDocument_ComplexHierarchy`: Dokument mit 3 Titeln, Untertiteln, 15 Positionen, gemischten Typen → korrekte Nummerierung und Summen.
- `TestDocument_ArticleIntegration`: Artikel anlegen → In Dokument einfügen → Artikel ändern → Dokument-Item unverändert.
- `TestDocument_MixedVatSummary`: Dokument mit 19% und 7% Positionen → korrekte vat_summary.
- `TestDocument_ReorderWithHierarchyChange`: Item von einem Titel zu einem anderen verschieben → Nummern und Summen aktualisiert.

### Test Case Pack

1) **Einfaches Angebot**
   - Setup: Angebot, 3 Normalpos (10×15€, 5×20€, 1×500€)
   - Expected: net=750, vat=142.50, gross=892.50

2) **Angebot mit Alternativpositionen**
   - Setup: 2 Normal (100€, 200€), 1 Alternativ (150€)
   - Expected: net=300 (Alternativ nicht gezählt)

3) **Gemischte MwSt**
   - Setup: Pos A (19%, 100€), Pos B (7%, 50€)
   - Expected: vat_summary=[{19%: net=100, vat=19}, {7%: net=50, vat=3.50}], gross=172.50

4) **Gesamtpreisbasis**
   - Setup: pricing_mode=total, GP=100, Menge=3
   - Expected: EP=33.3333, GP=100.00

5) **Pauschalposition**
   - Setup: position_type=flat_rate, unit=psch., quantity=1, unit_price=5000
   - Expected: GP=5000

6) **3-Ebenen Hierarchie**
   - Setup: Titel "EG" → Untertitel "Wände" → Position "Streichen"
   - Expected: Positionsnummer "1.1.1"

7) **Reorder mit Parent-Wechsel**
   - Setup: Pos unter Titel A → Move zu Titel B
   - Expected: Positionsnummern beider Titel aktualisiert

8) **Dokument konvertieren**
   - Setup: Finalisiertes Angebot AN-2026-0001
   - Action: Convert to order_confirmation
   - Expected: Neue AB (draft), source_document_id = Angebot-ID, alle Items kopiert

9) **Positionsrabatt**
   - Setup: Menge=10, EP=100, Rabatt=15%
   - Expected: GP = 10 × 100 × 0.85 = 850.00

10) **Rundung Stresstest**
    - Setup: EP=1.005, Menge=3
    - Expected: GP=3.02 (kaufmännisch gerundet)

## Verification Checklist
- [ ] Migration: `documents` Tabelle erstellt mit allen Spalten
- [ ] Migration: `document_items` Tabelle erstellt mit allen Spalten
- [ ] Migration: `document_vat_summary` Tabelle erstellt
- [ ] Migration reversibel (DOWN)
- [ ] UNIQUE Constraint auf (tenant_id, document_number) WHERE NOT NULL
- [ ] CASCADE DELETE auf document_items und document_vat_summary
- [ ] Alle 7 Dokumententypen unterstützt
- [ ] Alle 5 Positionstypen funktionieren
- [ ] Hierarchie (max 3 Ebenen) durchgesetzt
- [ ] Positionsnummern automatisch generiert
- [ ] Summenberechnung korrekt (Netto/MwSt/Brutto)
- [ ] Kaufmännische Rundung auf 2 Stellen
- [ ] MwSt-Aufschlüsselung bei gemischten Sätzen
- [ ] Pricing Mode unit und total
- [ ] Division durch Null bei Menge=0 abgefangen
- [ ] Alternativ- und Bedarfspositionen nicht in Summe
- [ ] Artikel-Übernahme als Snapshot
- [ ] Klonen erstellt vollständige Kopie
- [ ] Konvertieren erstellt neues Dokument mit Referenz
- [ ] Reorder-API mit Hierarchie-Wechsel
- [ ] Soft-Delete implementiert
- [ ] Tenant-Isolation
- [ ] Permissions durchgesetzt
- [ ] API Responses matchen OpenAPI-Spec
- [ ] `make lint` keine neuen Issues
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen

## Dependencies
- ZMI-TICKET-104 (Artikelstamm — für Artikel-Übernahme)
- ZMI-TICKET-101 (Kontakte — für contact_id)
- ZMI-TICKET-110 (Projekte — für project_id)

## Notes
- Das Document-Modell ist die zentrale Entität für die gesamte Dokumenten-Engine. Es muss von Anfang an robust und erweiterbar sein.
- Die denormalisierten Summen (net_total, vat_total, gross_total) auf dem Dokument sind ein bewusster Trade-off: Performance bei Auflistung vs. Konsistenz. Die Summen werden bei jeder Item-Änderung neuberechnet.
- Die `document_vat_summary` Tabelle wird bei jeder Summen-Neuberechnung komplett ersetzt (DELETE + INSERT). Das ist einfacher und bei der erwarteten Datenmenge performant genug.
- Positionsnummern werden NICHT in der DB gespeichert, sondern bei jedem Abruf on-the-fly berechnet. Das vermeidet Konsistenzprobleme bei Reorder.
- Die Konvertierungsmatrix (welcher Typ → welcher Typ) sollte als Business Rule im Service definiert werden, nicht hartcodiert im Handler.
