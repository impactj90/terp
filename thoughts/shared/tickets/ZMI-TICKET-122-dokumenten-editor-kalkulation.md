# ZMI-TICKET-122: Dokumenten-Editor — Kalkulation (Tiefenkalkulation, Zuschlagssätze)

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 3 — Nummernkreise & Dokumenten-Engine
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.2 Tiefenkalkulation (Detail-Kalkulation pro Position)
Blocked by: ZMI-TICKET-121, ZMI-TICKET-104
Blocks: ZMI-TICKET-124, ZMI-TICKET-112, ZMI-TICKET-160

## Goal
Tiefenkalkulation (Detail-Kalkulation) pro Dokumentenposition implementieren. Jede Position kann mehrere Kostenblöcke haben (Lohn, Material, Geräte, Fremdleistungen, Sonstiges). Auf die Basiskosten werden konfigurierbare Zuschlagssätze (AGK, Wagnis, Gewinn) angewendet, um den Verkaufspreis zu berechnen. Die Kalkulation ist die Brücke zwischen Einkaufspreisen und dem Endpreis für den Kunden.

## Scope
- **In scope:** Datenmodell (document_item_cost_blocks, document_item_cost_entries), Zuschlagsberechnung, Verkaufspreis-Ableitung aus Kalkulation, Zeitanzeige (kalkulierte Arbeitsstunden), Document-Level Zuschlagsüberschreibung, API für Kalkulationsdaten.
- **Out of scope:** Frontend UI (ZMI-TICKET-124), Nachkalkulation (ZMI-TICKET-160), Aufmaß-Integration (ZMI-TICKET-150).

## Requirements

### Datenmodell

#### Tabelle `document_item_cost_blocks`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_item_id | UUID | FK document_items, NOT NULL, ON DELETE CASCADE | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| cost_type | VARCHAR(20) | NOT NULL | 'labor', 'material', 'equipment', 'subcontractor', 'other' |
| base_cost | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Summe der Basiskosten (Summe aller Entries) pro Einheit |
| surcharge_amount | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Berechneter Zuschlagsbetrag pro Einheit |
| total_cost | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | base_cost + surcharge_amount pro Einheit |
| sort_order | INT | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (document_item_id, cost_type) — ein Block pro Kostenart pro Position.

#### Tabelle `document_item_cost_entries`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| cost_block_id | UUID | FK document_item_cost_blocks, NOT NULL, ON DELETE CASCADE | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| article_id | UUID | FK articles, NULL | Verknüpfung zum Artikelstamm |
| description | VARCHAR(500) | NOT NULL | Bezeichnung (z.B. "Wandfarbe Premium", "Abdeckmaterial") |
| unit | VARCHAR(20) | | Einheit |
| quantity | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Menge pro Einheit der übergeordneten Position |
| unit_cost | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | Einzelkosten (EK) |
| total_cost | DECIMAL(14,4) | NOT NULL, DEFAULT 0 | quantity × unit_cost |
| sort_order | INT | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `document_surcharge_overrides`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL, ON DELETE CASCADE | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| cost_type | VARCHAR(20) | NOT NULL | Kostenart |
| surcharge_name | VARCHAR(100) | NOT NULL | Name des Zuschlags |
| surcharge_percent | DECIMAL(8,4) | NOT NULL | Überschriebener Prozentsatz |
| sort_order | INT | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (document_id, cost_type, surcharge_name)

### Kalkulationslogik

#### Kostenblock-Berechnung (pro Position, pro Kostenart, pro Einheit)
```
Für jede Kostenart (labor, material, equipment, subcontractor, other):
  base_cost = Summe aller cost_entries.total_cost

  surcharges = document_surcharge_overrides (falls vorhanden)
             ODER surcharge_rates (Tenant-Default)

  surcharge_amount = base_cost × (Summe aller surcharge_percent / 100)

  WICHTIG: Zuschläge werden auf Basiskosten berechnet, NICHT kaskadierend!
  D.h. bei AGK=50%, Wagnis=10%, Gewinn=8%:
    surcharge_amount = base_cost × (50 + 10 + 8) / 100 = base_cost × 0.68
  NICHT: ((base_cost × 1.5) × 1.1) × 1.08

  total_cost = base_cost + surcharge_amount
```

#### Verkaufspreis pro Position (pro Einheit)
```
unit_price (EP) = Summe aller cost_block.total_cost aller Kostenarten
Gesamtpreis (GP) = EP × Menge
```

#### Zeitwert-Berechnung
```
Für jeden Lohn-Eintrag in der Kalkulation:
  Wenn article.cost_type = 'labor':
    time_value = entry.quantity × article.time_value (Stunden pro Einheit)

Position.time_value = Summe aller Lohn-Zeitwerte

Dokument.total_time = Summe aller Position.time_value × Position.quantity
```

### Beispiel-Kalkulation

Position "Wand streichen, 2x Anstrich" (pro m²):

```
Kostenblock: Lohn
  ├── Zeitansatz: 0.15 h/m² × 45.00 €/h = 6.75 €/m²

Kostenblock: Material
  ├── Wandfarbe: 0.3 l/m² × 8.50 €/l = 2.55 €/m²
  └── Abdeckmaterial: 1 × 0.50 € = 0.50 €/m²

Kostenblock: Geräte
  └── Sprühgerät: 1 × 0.30 € = 0.30 €/m²

Zuschläge:
  Auf Lohn: +68% (AGK, Wagnis, Gewinn) → 6.75 × 0.68 = 4.59 €
  Auf Material: +15% → 3.05 × 0.15 = 0.46 €
  Auf Geräte: +10% → 0.30 × 0.10 = 0.03 €

Verkaufspreis: (6.75+4.59) + (3.05+0.46) + (0.30+0.03) = 15.18 €/m²
Zeitwert: 0.15 h/m²
```

### Business Rules

1. **Kalkulation ist optional.** Positionen können auch ohne Tiefenkalkulation existieren (dann nur EP direkt eingeben).
2. **Zuschläge nur auf Basiskosten** (nicht kaskadierend). Dies ist branchenüblich im Handwerk.
3. **Negative Zuschläge erlaubt** (als Rabatt). Zuschlagssatz kann auch 0% sein → Kosten = Verkaufspreis.
4. **Stundenverrechnungssatz** (aus Tenant-Settings) dient nur als Kontrolle, nicht als direkte Kalkulationsgrundlage. Der tatsächliche Stundensatz wird in den Lohn-Entries definiert.
5. **Zuschläge pro Dokument überschreibbar.** Jedes Dokument kann eigene Zuschlagssätze haben (für individuelle Angebote).
6. **Kalkulation ändert EP.** Wenn Kalkulation vorhanden → EP wird aus Kalkulation berechnet. Manuelle EP-Änderung überschreibt die Kalkulation (Warnung an Frontend).
7. **Artikel-Übernahme in Kalkulation.** Wenn ein Artikel eingefügt wird: Automatisch cost_entry erstellen mit Artikeldaten.
8. **Rundung.** Basiskosten und Zuschläge auf 4 Dezimalstellen. Finale EP-Berechnung auf 4 Dezimalstellen. GP auf 2 Dezimalstellen (kaufmännisch).
9. **Division durch Null.** Bei Menge=0 → Gesamtpreisbasis nicht möglich, EP bleibt wie berechnet.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /documents/{docId}/items/{itemId}/calculation | Kalkulation einer Position abrufen |
| PUT | /documents/{docId}/items/{itemId}/calculation | Kalkulation einer Position setzen (vollständig) |
| POST | /documents/{docId}/items/{itemId}/calculation/entries | Kosteneintrag hinzufügen |
| PATCH | /documents/{docId}/items/{itemId}/calculation/entries/{entryId} | Kosteneintrag aktualisieren |
| DELETE | /documents/{docId}/items/{itemId}/calculation/entries/{entryId} | Kosteneintrag löschen |
| GET | /documents/{docId}/surcharges | Dokument-Zuschlagssätze abrufen |
| PUT | /documents/{docId}/surcharges | Dokument-Zuschlagssätze setzen |
| GET | /documents/{docId}/time-summary | Zeitwert-Zusammenfassung |

#### GET /documents/{docId}/items/{itemId}/calculation Response
```json
{
  "item_id": "...",
  "cost_blocks": [
    {
      "cost_type": "labor",
      "entries": [
        {
          "id": "...",
          "description": "Zeitansatz",
          "unit": "h/m²",
          "quantity": 0.15,
          "unit_cost": 45.00,
          "total_cost": 6.75,
          "article_id": null
        }
      ],
      "base_cost": 6.75,
      "surcharges": [
        { "name": "AGK", "percent": 50.0, "amount": 3.375 },
        { "name": "Wagnis", "percent": 10.0, "amount": 0.675 },
        { "name": "Gewinn", "percent": 8.0, "amount": 0.540 }
      ],
      "surcharge_amount": 4.59,
      "total_cost": 11.34
    },
    {
      "cost_type": "material",
      "entries": [...],
      "base_cost": 3.05,
      "surcharges": [...],
      "surcharge_amount": 0.46,
      "total_cost": 3.51
    }
  ],
  "unit_price_calculated": 15.18,
  "time_value_per_unit": 0.15,
  "total_time_hours": 12.825
}
```

#### GET /documents/{docId}/time-summary Response
```json
{
  "document_id": "...",
  "positions": [
    {
      "item_id": "...",
      "short_text": "Wand streichen, 2x Anstrich",
      "time_per_unit": 0.15,
      "quantity": 85.5,
      "total_hours": 12.825
    }
  ],
  "total_hours": 47.5,
  "estimated_days": 5.9
}
```

### Permissions
- `documents.edit` — Kalkulation bearbeiten (gleiche Berechtigung wie Dokument bearbeiten)
- `surcharges.edit` — (existiert aus ZMI-TICKET-104) Zuschlagssätze global verwalten

## Acceptance Criteria
1. Kostenblöcke pro Position für alle 5 Kostenarten erstell- und bearbeitbar.
2. Kosteneinträge innerhalb eines Blocks mit Artikelreferenz möglich.
3. Zuschlagsberechnung korrekt (nicht kaskadierend, auf Basiskosten).
4. Verkaufspreis (EP) wird aus Kalkulation berechnet.
5. Dokument-Level Zuschlagsüberschreibung funktioniert.
6. Zeitwert-Berechnung korrekt (Stunden aus Lohn-Einträgen).
7. Kalkulation ist optional (Positionen ohne Kalkulation weiterhin möglich).
8. Rundung korrekt (4 Dezimalstellen intern, 2 für GP).
9. Negative Zuschläge (Rabatte) funktionieren.
10. Änderung der Kalkulation aktualisiert EP und Dokumentsummen automatisch.

## Tests

### Unit Tests — Service

#### Zuschlagsberechnung
- `TestCalc_Surcharge_SingleType`: Lohn base=100, Zuschlag 68% → surcharge=68, total=168.
- `TestCalc_Surcharge_MultipleSurcharges`: AGK=50%, Wagnis=10%, Gewinn=8% → total surcharge = 68%.
- `TestCalc_Surcharge_NotCascading`: Verify 68% auf base, nicht ((×1.5)×1.1)×1.08.
- `TestCalc_Surcharge_ZeroPercent`: Zuschlag=0% → total = base.
- `TestCalc_Surcharge_NegativePercent`: Zuschlag=-10% → total = base × 0.9.
- `TestCalc_Surcharge_NoSurchargesConfigured`: Keine Zuschläge → total = base.
- `TestCalc_Surcharge_PerDocumentOverride`: Dokument-Override statt Tenant-Default.
- `TestCalc_Surcharge_MixedCostTypes`: Lohn 68%, Material 15%, Geräte 10% → jeweils korrekt.

#### Verkaufspreis-Berechnung
- `TestCalc_UnitPrice_FromCalculation`: EP = Summe aller cost_block.total_cost.
- `TestCalc_UnitPrice_Example`: Lohn=11.34 + Material=3.51 + Geräte=0.33 = 15.18.
- `TestCalc_UnitPrice_SingleCostType`: Nur Lohn → EP = labor.total_cost.
- `TestCalc_UnitPrice_NoCostBlocks`: Keine Kalkulation → EP bleibt manuell.
- `TestCalc_UnitPrice_UpdatesPropagation`: Kalkulation ändern → EP und GP und Dokumentsummen aktualisiert.

#### Kosteneinträge
- `TestCalc_Entry_Add`: Eintrag hinzufügen → base_cost aktualisiert.
- `TestCalc_Entry_Update`: Eintrag ändern → base_cost und surcharge neuberechnet.
- `TestCalc_Entry_Delete`: Eintrag löschen → base_cost und surcharge neuberechnet.
- `TestCalc_Entry_WithArticle`: Eintrag mit article_id → Snapshot der Artikeldaten.
- `TestCalc_Entry_Calculation`: quantity=0.3, unit_cost=8.50 → total_cost=2.55.
- `TestCalc_Entry_Rounding`: quantity=0.333, unit_cost=10.001 → total_cost korrekt gerundet (4 Stellen).

#### Zeitwert
- `TestCalc_TimeValue_SingleLabor`: 1 Lohn-Eintrag, time_value=0.15 → time_per_unit=0.15.
- `TestCalc_TimeValue_MultipleLabor`: 2 Lohn-Einträge mit Zeitwerten → Summe.
- `TestCalc_TimeValue_NoLabor`: Nur Material → time_value=0.
- `TestCalc_TimeValue_DocumentTotal`: 3 Positionen mit Zeitwerten → total_hours korrekt.
- `TestCalc_TimeValue_EstimatedDays`: total_hours=47.5, 8h/Tag → estimated_days=5.94.

#### Volle Kalkulations-Beispiele
- `TestCalc_FullExample_WandStreichen`: Exaktes Beispiel aus Requirements → EP=15.18 (oder nah dran nach Rundung).
- `TestCalc_FullExample_OnlyLabor`: Nur Lohn, 1h × 45€, 68% Zuschlag → EP=75.60.
- `TestCalc_FullExample_NoSurcharges`: Alle Zuschläge 0% → EP = Summe Basiskosten.

### API Tests — Handler

- `TestCalcHandler_GetCalculation_200`: Kalkulation mit allen Blöcken und Einträgen.
- `TestCalcHandler_GetCalculation_200_Empty`: Position ohne Kalkulation → leere cost_blocks.
- `TestCalcHandler_PutCalculation_200`: Vollständige Kalkulation setzen.
- `TestCalcHandler_AddEntry_201`: Einzelnen Kosteneintrag hinzufügen.
- `TestCalcHandler_UpdateEntry_200`: Kosteneintrag aktualisieren.
- `TestCalcHandler_DeleteEntry_200`: Kosteneintrag löschen.
- `TestCalcHandler_GetSurcharges_200`: Dokument-Zuschläge abrufen.
- `TestCalcHandler_PutSurcharges_200`: Dokument-Zuschläge überschreiben.
- `TestCalcHandler_TimeSummary_200`: Zeitwert-Zusammenfassung.
- `TestCalcHandler_FinalizedDocument_403`: Kalkulation auf finalisiertem Dokument bearbeiten → 403.
- `TestCalcHandler_TenantIsolation`: Kalkulation von fremdem Tenant → 404.

### Integration Tests

- `TestCalc_EndToEnd_WithSurcharges`: Zuschläge konfigurieren → Position erstellen → Kalkulation hinzufügen → EP und Summen prüfen.
- `TestCalc_EndToEnd_OverrideSurcharges`: Tenant-Zuschläge → Dokument-Override → Kalkulation prüfen → Override entfernen → zurück zu Tenant-Default.
- `TestCalc_EndToEnd_ArticleToCalculation`: Artikel einfügen → Kalkulation automatisch aus Artikeldaten → EP korrekt.
- `TestCalc_EndToEnd_MultipleCostTypes`: Position mit allen 5 Kostenarten → Gesamtberechnung korrekt.

### Test Case Pack

1) **Einfache Lohnkalkulation**
   - Setup: 1 Lohn-Eintrag: 1h × 45€, Zuschlag 68%
   - Expected: base=45, surcharge=30.60, total=75.60, EP=75.60

2) **Volle Kalkulation (Wand streichen)**
   - Setup: Lohn(0.15h×45€), Material(0.3l×8.50€ + 0.50€), Geräte(0.30€), Zuschläge L:68%, M:15%, G:10%
   - Expected: EP≈15.18

3) **Nur Material, kein Zuschlag**
   - Setup: Material 10.00€, Zuschlag 0%
   - Expected: EP=10.00

4) **Negativer Zuschlag (Rabatt)**
   - Setup: Lohn 100€, Zuschlag -10%
   - Expected: base=100, surcharge=-10, total=90, EP=90

5) **Dokument-Zuschläge überschreiben Tenant**
   - Setup: Tenant Lohn-Zuschlag=68%, Dokument-Override=50%
   - Expected: Zuschlag auf Lohn = 50% (nicht 68%)

6) **Position ohne Kalkulation**
   - Setup: Position mit manuell gesetztem EP=25.00, keine cost_blocks
   - Expected: EP=25.00, keine Zuschlagsberechnung

7) **Zeitwert-Berechnung**
   - Setup: Position mit Lohn 0.15h/m², Menge=85.5m²
   - Expected: time_per_unit=0.15, total_hours=12.825

8) **Alle 5 Kostenarten**
   - Setup: Lohn=10, Mat=20, Geräte=5, Fremd=15, Sonst=3, jeweilige Zuschläge
   - Expected: EP = Summe aller (base + surcharge) pro Kostenart

## Verification Checklist
- [ ] Migration: `document_item_cost_blocks` Tabelle erstellt
- [ ] Migration: `document_item_cost_entries` Tabelle erstellt
- [ ] Migration: `document_surcharge_overrides` Tabelle erstellt
- [ ] Migration reversibel (DOWN)
- [ ] CASCADE DELETE von cost_blocks bei Item-Löschung
- [ ] CASCADE DELETE von cost_entries bei Block-Löschung
- [ ] UNIQUE (document_item_id, cost_type) auf cost_blocks
- [ ] Zuschlagsberechnung nicht kaskadierend (nur auf Basiskosten)
- [ ] Negative Zuschläge erlaubt
- [ ] Dokument-Level Zuschlagsüberschreibung
- [ ] EP-Berechnung aus Kalkulation
- [ ] EP-Berechnung propagiert zu GP und Dokumentsummen
- [ ] Zeitwert-Berechnung korrekt
- [ ] Rundung: 4 Dezimalstellen intern, 2 für GP
- [ ] Kalkulation optional (Positionen ohne Kalkulation möglich)
- [ ] Finalisierte Dokumente: Kalkulation nicht bearbeitbar
- [ ] Tenant-Isolation
- [ ] API Responses matchen OpenAPI-Spec
- [ ] `make lint` keine neuen Issues
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell — für document_items)
- ZMI-TICKET-104 (Artikelstamm — für surcharge_rates, articles)

## Notes
- Die Kalkulation ist das Herzstück der Preisfindung im Handwerk. Die Tiefenkalkulation ermöglicht es, den Verkaufspreis nachvollziehbar aus den einzelnen Kostenbestandteilen abzuleiten.
- Die nicht-kaskadierende Zuschlagsberechnung ist branchenüblich und einfacher zu verstehen. Alternative (kaskadierende Berechnung) würde deutlich kompliziertere Logik erfordern.
- Pro Einheit vs. Gesamt: Die Kalkulation erfolgt pro Einheit der Position. Der Gesamtpreis ergibt sich aus EP × Menge.
- Die `document_surcharge_overrides` erlauben individuelle Zuschläge pro Dokument, z.B. für besonders kompetitive Angebote.
- Die Zeitwert-Berechnung ist eine Vorbereitung für die Nachkalkulation (ZMI-TICKET-160) und das Projekt-Dashboard (ZMI-TICKET-112).
