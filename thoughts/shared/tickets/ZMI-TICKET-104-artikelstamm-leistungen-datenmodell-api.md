# ZMI-TICKET-104: Artikelstamm/Leistungen — Datenmodell & API

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitt 2.2 Leistungen & Material (Artikelstamm)
Blocks: ZMI-TICKET-105, ZMI-TICKET-106, ZMI-TICKET-121, ZMI-TICKET-200

## Goal
Artikelstamm (Leistungen & Material) als zentrale Datenbasis für alle Dokumente, Kalkulationen und die spätere Lagerverwaltung implementieren. Jeder Artikel hat Einkaufs-/Verkaufspreise, Kostenarten, Zuschlagssätze und kann hierarchisch in Kategorien organisiert werden.

## Scope
- **In scope:** Datenmodell, Migration, Repository, Service, Handler, OpenAPI für Artikelstamm CRUD, Kategorie-Verwaltung, Zuschlagssatz-Konfiguration, Volltextsuche.
- **Out of scope:** DATANORM-Import (ZMI-TICKET-105), Frontend UI (ZMI-TICKET-106), GAEB-Import (ZMI-TICKET-180), Lagerverwaltung (ZMI-TICKET-200+).

## Requirements

### Datenmodell

#### Tabelle `article_categories`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| parent_id | UUID | FK article_categories, NULL | Übergeordnete Kategorie (für Baumstruktur) |
| name | VARCHAR(255) | NOT NULL | Kategoriename (z.B. "Malerarbeiten", "Material Farben") |
| sort_order | INT | NOT NULL, DEFAULT 0 | Sortierung innerhalb der Ebene |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (tenant_id, parent_id, name) — keine Duplikate auf gleicher Ebene.

#### Tabelle `articles`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| article_number | VARCHAR(50) | | Artikelnummer (optional, z.B. DATANORM-Nr.) |
| short_text | VARCHAR(255) | NOT NULL | Kurzbezeichnung |
| long_text | TEXT | | Langtext/Beschreibung |
| unit | VARCHAR(20) | NOT NULL, DEFAULT 'Stk' | Einheit (Stk, m, m², m³, kg, l, psch., h, Paar, Satz, etc.) |
| purchase_price | DECIMAL(12,4) | NOT NULL, DEFAULT 0 | Einkaufspreis (EK) netto |
| sales_price | DECIMAL(12,4) | | Verkaufspreis (VK) netto — NULL wenn zuschlagsbasiert |
| sales_price_mode | VARCHAR(20) | NOT NULL, DEFAULT 'manual' | 'manual' (VK direkt) oder 'surcharge' (VK aus EK + Zuschläge) |
| cost_type | VARCHAR(20) | NOT NULL, DEFAULT 'material' | 'labor', 'material', 'equipment', 'subcontractor', 'other' |
| category_id | UUID | FK article_categories, NULL | Zuordnung zu Kategorie |
| commodity_group | VARCHAR(50) | | Warengruppe (aus DATANORM) |
| discount_group | VARCHAR(50) | | Rabattgruppe (aus DATANORM) |
| time_value | DECIMAL(10,4) | | Zeitwert in Stunden pro Einheit (für Lohnkalkulation) |
| is_archived | BOOLEAN | NOT NULL, DEFAULT false | Soft-Delete |
| datanorm_source | VARCHAR(100) | | Herkunft-Katalog (z.B. "Großhändler XY 2026") |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |
| updated_by | UUID | FK users | |

#### Tabelle `surcharge_rates`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| cost_type | VARCHAR(20) | NOT NULL | Kostenart: 'labor', 'material', 'equipment', 'subcontractor', 'other' |
| surcharge_name | VARCHAR(100) | NOT NULL | z.B. "AGK", "Wagnis", "Gewinn" |
| surcharge_percent | DECIMAL(8,4) | NOT NULL | Zuschlagsprozentsatz (z.B. 68.0 für +68%) |
| sort_order | INT | NOT NULL, DEFAULT 0 | Reihenfolge der Zuschläge |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** Zuschläge werden pro Kostenart konfiguriert und auf die Basiskosten angewendet (nicht kaskadierend — kein Zuschlag auf Zuschlag).

#### Tabelle `article_surcharge_overrides`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| article_id | UUID | FK articles, NOT NULL | |
| surcharge_rate_id | UUID | FK surcharge_rates, NOT NULL | |
| override_percent | DECIMAL(8,4) | NOT NULL | Abweichender Zuschlag für diesen Artikel |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (article_id, surcharge_rate_id) — maximal ein Override pro Zuschlag pro Artikel.

### Indizes
- `articles`: (tenant_id, article_number) UNIQUE WHERE article_number IS NOT NULL
- `articles`: (tenant_id, is_archived)
- `articles`: (tenant_id, cost_type)
- `articles`: (tenant_id, category_id)
- `articles`: GIN-Index auf (short_text, long_text, article_number) für Volltextsuche
- `article_categories`: (tenant_id, parent_id)
- `surcharge_rates`: (tenant_id, cost_type)

### Einheiten (Enum/Validation)
Erlaubte Werte: `Stk`, `m`, `m²`, `m³`, `kg`, `l`, `psch.`, `h`, `Paar`, `Satz`, `Pauschale`, `Bund`, `Rolle`, `Dose`, `Eimer`, `Karton`
- Erweiterbar über Konfiguration (nicht hartcodiert, aber Default-Liste vorgeben)
- `psch.` (pauschal) impliziert Menge = 1 bei Verwendung in Dokumenten

### Kostenarten (Enum)
| Wert | Beschreibung |
|------|-------------|
| `labor` | Lohn |
| `material` | Material |
| `equipment` | Geräte |
| `subcontractor` | Fremdleistungen |
| `other` | Sonstiges |

### Business Rules
1. `short_text` ist Pflicht, mindestens 2 Zeichen.
2. `purchase_price` darf 0 sein (z.B. Kulanzleistung) — kein negativer Preis erlaubt.
3. `sales_price_mode = 'surcharge'`: VK wird berechnet aus EK + Zuschläge der jeweiligen Kostenart. `sales_price` bleibt NULL.
4. `sales_price_mode = 'manual'`: VK wird direkt eingegeben. Zuschläge werden ignoriert.
5. Berechneter VK bei Zuschlagsmodus: `VK = EK × (1 + Summe(Zuschlagsprozente) / 100)`. Zuschläge nur auf Basiskosten, nicht kaskadierend.
6. `article_number` muss innerhalb eines Tenants eindeutig sein (wenn gesetzt).
7. Archivierte Artikel werden in Listen ausgeblendet, aber in bestehenden Dokumenten referenziert: Warnung "Artikel wurde archiviert" anzeigen.
8. `time_value` wird für die Zeitanzeige pro Position in Dokumenten verwendet (z.B. 0.15 h/m² → bei 100 m² = 15h).
9. Kategorien können maximal 3 Ebenen tief verschachtelt werden.
10. Negative Zuschläge (Rabatt) sind erlaubt.

### Berechneter Verkaufspreis (Service-Logik)
```
Für einen Artikel mit cost_type = 'labor' und EK = 45.00 €/h:
  Zuschläge (tenant-global): AGK +15%, Wagnis +5%, Gewinn +10%
  → Gesamt-Zuschlag: 30%
  → VK = 45.00 × 1.30 = 58.50 €/h

Für einen Artikel mit Override:
  AGK hat Override von +20% statt +15%
  → Gesamt-Zuschlag: 20% + 5% + 10% = 35%
  → VK = 45.00 × 1.35 = 60.75 €/h
```

### API / OpenAPI

#### Artikel-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /articles | Artikel anlegen |
| GET | /articles | Liste mit Suche, Filter, Pagination |
| GET | /articles/{id} | Artikel-Detail inkl. berechneter VK |
| PATCH | /articles/{id} | Artikel aktualisieren |
| DELETE | /articles/{id} | Soft-Delete (archivieren) |
| POST | /articles/{id}/duplicate | Artikel duplizieren |

#### Kategorie-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /article-categories | Kategorie anlegen |
| GET | /article-categories | Kategoriebaum abrufen |
| PATCH | /article-categories/{id} | Kategorie aktualisieren |
| DELETE | /article-categories/{id} | Kategorie löschen (nur wenn leer) |

#### Zuschlagssatz-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /surcharge-rates | Alle Zuschlagssätze (gruppiert nach Kostenart) |
| POST | /surcharge-rates | Zuschlagssatz anlegen |
| PATCH | /surcharge-rates/{id} | Zuschlagssatz aktualisieren |
| DELETE | /surcharge-rates/{id} | Zuschlagssatz löschen |

#### Query-Parameter für GET /articles
- `search` (string): Volltextsuche über short_text, long_text, article_number (mit Teilstring und Synonym-Toleranz)
- `cost_type` (string): Filter nach Kostenart
- `category_id` (UUID): Filter nach Kategorie (inkl. Unterkategorien)
- `is_archived` (bool): Default false
- `sales_price_mode` (string): 'manual' | 'surcharge'
- `price_min`, `price_max` (decimal): Preisbereich (EK)
- `sort_by`: 'short_text' | 'article_number' | 'purchase_price' | 'created_at'
- `sort_order`: 'asc' | 'desc'
- `page`, `page_size`: Pagination

#### Response-Besonderheiten
- GET /articles/{id} enthält:
  - `calculated_sales_price`: Berechneter VK (auch bei surcharge-Modus)
  - `surcharges`: Liste der angewendeten Zuschläge mit Prozent und Betrag
  - `total_surcharge_percent`: Gesamtzuschlag in Prozent
- GET /articles (Liste) enthält `calculated_sales_price` als berechnetes Feld

### Permissions
- `articles.view` — Artikel/Leistungen anzeigen
- `articles.create` — Artikel anlegen
- `articles.edit` — Artikel bearbeiten
- `articles.delete` — Artikel archivieren
- `articles.surcharges` — Zuschlagssätze verwalten

## Acceptance Criteria
1. Artikel-CRUD funktioniert mit striktem Tenant-Scoping.
2. Kategorien unterstützen 3-Ebenen-Baumstruktur.
3. Zuschlagssätze sind pro Kostenart konfigurierbar.
4. Berechneter VK wird korrekt aus EK + Zuschläge berechnet (nicht kaskadierend).
5. Artikel-Overrides für Zuschläge überschreiben Tenant-Defaults.
6. Volltextsuche findet über short_text, long_text und article_number.
7. Artikel mit `psch.`-Einheit werden korrekt behandelt.
8. Archivierte Artikel sind in Listen ausgeblendet.
9. Artikelnummer ist tenant-weit eindeutig.
10. OpenAPI-Spec dokumentiert alle Endpunkte, Felder und Berechnungslogik.

## Tests

### Unit Tests — Repository

#### Artikel CRUD
- `TestArticleRepository_Create`: Artikel mit allen Feldern anlegen, zurücklesen.
- `TestArticleRepository_Create_MinimalFields`: Nur short_text und unit → OK, Defaults korrekt.
- `TestArticleRepository_Create_DuplicateArticleNumber`: Gleiche article_number im Tenant → Fehler.
- `TestArticleRepository_Create_DuplicateArticleNumber_DifferentTenant`: Gleiche Nummer, anderer Tenant → OK.
- `TestArticleRepository_Create_NullArticleNumber`: article_number NULL → OK (nicht unique-constrained).
- `TestArticleRepository_Update`: Felder aktualisieren, updated_at gesetzt.
- `TestArticleRepository_Archive`: is_archived = true, nicht in Default-Liste.
- `TestArticleRepository_Archive_WithFilter`: Mit is_archived=true abrufbar.
- `TestArticleRepository_TenantIsolation`: Artikel Tenant A nicht in Tenant B sichtbar.
- `TestArticleRepository_Duplicate`: Artikel duplizieren → neuer Artikel mit "(Kopie)" im Namen.

#### Suche
- `TestArticleRepository_Search_ShortText`: Suche über Kurzbezeichnung.
- `TestArticleRepository_Search_LongText`: Suche über Langtext.
- `TestArticleRepository_Search_ArticleNumber`: Suche über Artikelnummer.
- `TestArticleRepository_Search_Partial`: Teilstring "Wand" findet "Wandfarbe weiß".
- `TestArticleRepository_Search_CaseInsensitive`: "wandfarbe" findet "Wandfarbe".
- `TestArticleRepository_Search_Umlaut`: "Flache" findet "Fläche" (Toleranz optional, mindestens exakt).

#### Filter & Pagination
- `TestArticleRepository_List_ByCostType`: Filter nach cost_type = 'material'.
- `TestArticleRepository_List_ByCategory`: Filter nach category_id, inkl. Unterkategorien.
- `TestArticleRepository_List_ByPriceRange`: price_min=10, price_max=50.
- `TestArticleRepository_List_Pagination`: Page 1, page_size 10 von 25 Artikeln.
- `TestArticleRepository_List_Sorting`: Sortierung nach short_text, purchase_price.

#### Kategorien
- `TestCategoryRepository_Create`: Kategorie anlegen.
- `TestCategoryRepository_Create_Nested`: Unterkategorie anlegen (parent_id).
- `TestCategoryRepository_Create_MaxDepth`: 4. Ebene → Fehler (max 3 Ebenen).
- `TestCategoryRepository_Create_DuplicateName`: Gleicher Name auf gleicher Ebene → Fehler.
- `TestCategoryRepository_Create_DuplicateName_DifferentParent`: Gleicher Name, anderer Parent → OK.
- `TestCategoryRepository_GetTree`: Kompletten Baum abrufen (3 Ebenen).
- `TestCategoryRepository_Delete_Empty`: Leere Kategorie löschen → OK.
- `TestCategoryRepository_Delete_WithArticles`: Kategorie mit Artikeln → Fehler.
- `TestCategoryRepository_Delete_WithChildren`: Kategorie mit Unterkategorien → Fehler.

#### Zuschlagssätze
- `TestSurchargeRepository_Create`: Zuschlagssatz anlegen.
- `TestSurchargeRepository_List_ByCostType`: Gruppiert nach Kostenart.
- `TestSurchargeRepository_Update`: Prozentsatz ändern.
- `TestSurchargeRepository_Delete`: Zuschlagssatz löschen.
- `TestSurchargeRepository_TenantIsolation`: Zuschläge Tenant-isoliert.

### Unit Tests — Service

#### Verkaufspreis-Berechnung
- `TestArticleService_CalculateSalesPrice_Manual`: sales_price_mode='manual' → VK direkt aus Feld.
- `TestArticleService_CalculateSalesPrice_Surcharge`: EK=100, Zuschläge 30% → VK=130.
- `TestArticleService_CalculateSalesPrice_MultipleSurcharges`: EK=45, AGK+15%, Wagnis+5%, Gewinn+10% → VK=45*1.30=58.50.
- `TestArticleService_CalculateSalesPrice_NoCascading`: Zuschläge werden auf Basispreis berechnet, nicht kaskadierend.
- `TestArticleService_CalculateSalesPrice_Override`: Artikel hat Override für AGK (20% statt 15%) → VK=45*1.35=60.75.
- `TestArticleService_CalculateSalesPrice_ZeroEK`: EK=0 → VK=0 (Kulanzleistung).
- `TestArticleService_CalculateSalesPrice_NegativeSurcharge`: Zuschlag -10% (Rabatt) → VK=EK*0.90.
- `TestArticleService_CalculateSalesPrice_ZeroSurcharge`: Alle Zuschläge 0% → VK=EK.
- `TestArticleService_CalculateSalesPrice_NoSurchargesConfigured`: Keine Zuschlagssätze für Kostenart → VK=EK.
- `TestArticleService_CalculateSalesPrice_Rounding`: VK wird auf 2 Dezimalstellen kaufmännisch gerundet.

#### Validierung
- `TestArticleService_Create_EmptyShortText`: Leerer short_text → Fehler.
- `TestArticleService_Create_ShortTextTooShort`: 1 Zeichen → Fehler (min 2).
- `TestArticleService_Create_NegativePrice`: EK < 0 → Fehler.
- `TestArticleService_Create_InvalidUnit`: Unbekannte Einheit → Fehler.
- `TestArticleService_Create_InvalidCostType`: Unbekannte Kostenart → Fehler.
- `TestArticleService_Create_PauschalUnit`: unit='psch.' → OK.
- `TestArticleService_Archive_ReferencedInDocument`: Archivieren wenn in Dokument referenziert → OK (Warnung, kein Block).

#### Kategorie-Validierung
- `TestArticleService_Category_MaxDepth3`: 4. Ebene → ValidationError.
- `TestArticleService_Category_DeleteNonEmpty`: Kategorie mit Artikeln → Error "Kategorie enthält Artikel".

### API Tests (Handler)

#### Artikel
- `TestArticleHandler_Create_201`: Valider Artikel → 201 mit allen Feldern.
- `TestArticleHandler_Create_201_WithCategory`: Artikel mit Kategorie-Zuordnung.
- `TestArticleHandler_Create_400_NoShortText`: Ohne short_text → 400.
- `TestArticleHandler_Create_400_NegativePrice`: EK < 0 → 400.
- `TestArticleHandler_Create_400_DuplicateNumber`: Doppelte article_number → 400.
- `TestArticleHandler_Create_401`: Ohne Auth → 401.
- `TestArticleHandler_Create_403`: Ohne articles.create → 403.
- `TestArticleHandler_Get_200`: Artikel abrufen mit calculated_sales_price und surcharges.
- `TestArticleHandler_Get_200_SurchargeMode`: Artikel im Zuschlagsmodus → calculated_sales_price berechnet.
- `TestArticleHandler_Get_200_ManualMode`: Artikel manuell → calculated_sales_price = sales_price.
- `TestArticleHandler_Get_404`: Nicht existierende ID → 404.
- `TestArticleHandler_Get_404_OtherTenant`: Anderer Tenant → 404.
- `TestArticleHandler_List_200`: Liste mit Pagination.
- `TestArticleHandler_List_Search`: Suchparameter filtert korrekt.
- `TestArticleHandler_List_ByCostType`: Filter cost_type='labor'.
- `TestArticleHandler_List_ByCategory`: Filter category_id mit Unterkategorien.
- `TestArticleHandler_List_ExcludesArchived`: Archivierte nicht in Default-Liste.
- `TestArticleHandler_Patch_200`: Felder aktualisieren.
- `TestArticleHandler_Patch_PartialUpdate`: Nur purchase_price ändern → Rest bleibt.
- `TestArticleHandler_Delete_200`: Soft-Delete.
- `TestArticleHandler_Duplicate_201`: Artikel dupliziert mit "(Kopie)".

#### Kategorien
- `TestCategoryHandler_Create_201`: Kategorie anlegen.
- `TestCategoryHandler_Create_201_Nested`: Unterkategorie anlegen.
- `TestCategoryHandler_Create_400_MaxDepth`: 4. Ebene → 400.
- `TestCategoryHandler_GetTree_200`: Baum korrekt aufgebaut.
- `TestCategoryHandler_Delete_200`: Leere Kategorie löschen.
- `TestCategoryHandler_Delete_400_NonEmpty`: Nicht-leere Kategorie → 400.

#### Zuschlagssätze
- `TestSurchargeHandler_List_200`: Zuschläge gruppiert nach Kostenart.
- `TestSurchargeHandler_Create_201`: Neuer Zuschlagssatz.
- `TestSurchargeHandler_Patch_200`: Prozentsatz ändern.
- `TestSurchargeHandler_Delete_200`: Zuschlagssatz löschen.
- `TestSurchargeHandler_Create_403`: Ohne articles.surcharges Permission → 403.

### Integration Tests
- `TestArticle_FullLifecycle`: Anlegen → Kategorie zuordnen → EK ändern → VK Neuberechnung → Archivieren.
- `TestArticle_SurchargeCalculation_EndToEnd`: Zuschlagssatz anlegen → Artikel anlegen (surcharge-Modus) → VK prüfen → Zuschlag ändern → VK hat sich geändert.
- `TestArticle_Override_EndToEnd`: Zuschlagssatz anlegen → Artikel mit Override anlegen → VK weicht ab → Override entfernen → VK stimmt mit Default.
- `TestArticle_CategoryTree_EndToEnd`: 3-Ebenen-Baum anlegen → Artikel zuordnen → Filter testen.
- `TestArticle_TenantIsolation_CrossTenant`: 2 Tenants, gleiche Artikelnummer → kein Konflikt.
- `TestArticle_Search_Comprehensive`: 20 Artikel anlegen, verschiedene Suchbegriffe, Filter-Kombinationen.

### Test Case Pack
1) **Material-Artikel anlegen**
   - Input: short_text="Wandfarbe weiß 10l", unit="Eimer", EK=35.00, cost_type="material", sales_price_mode="surcharge"
   - Zuschläge: Material +15%
   - Expected: VK = 35.00 × 1.15 = 40.25

2) **Lohn-Position anlegen**
   - Input: short_text="Wand streichen 2x Anstrich", unit="m²", EK=0 (kein Materialeinkauf), cost_type="labor", time_value=0.15
   - Zuschläge: Lohn +68% (AGK, Wagnis, Gewinn)
   - Expected: time_value korrekt gespeichert, VK-Berechnung basiert auf Stundensatz × time_value

3) **Pauschalposition**
   - Input: short_text="Baustelleneinrichtung", unit="psch.", EK=500.00, sales_price_mode="manual", sales_price=750.00
   - Expected: VK=750.00 (manuell), unit=psch.

4) **Kulanzleistung (EK=0)**
   - Input: short_text="Nachbesserung Kulanz", unit="psch.", EK=0, sales_price_mode="manual", sales_price=0
   - Expected: Artikel angelegt, EK=0, VK=0

5) **Zuschlag-Override**
   - Setup: Zuschlag "AGK" für Material = 15%
   - Input: Artikel mit Override AGK = 20%, EK=100
   - Expected: VK = 100 × (1 + 0.20) = 120 (nicht 115)

6) **Negativer Zuschlag (Rabatt)**
   - Input: Zuschlagssatz "Mitarbeiter-Rabatt" = -10%, EK=100
   - Expected: VK = 100 × 0.90 = 90

7) **Kategorie-Baum**
   - Input: "Malerarbeiten" → "Innen" → "Wände"
   - Expected: 3-Ebenen-Baum, Artikel in "Wände" → auch über Filter "Malerarbeiten" findbar

8) **Kategorie-Tiefenbegrenzung**
   - Input: Ebene 4 unter "Wände" anlegen
   - Expected: 400 "Maximale Verschachtelungstiefe (3) erreicht"

9) **Doppelte Artikelnummer**
   - Input: Zwei Artikel mit article_number="MAT-001" im gleichen Tenant
   - Expected: Zweiter → 400 "Artikelnummer bereits vergeben"

10) **Suche Teilstring**
    - Setup: Artikel "Wandfarbe weiß", "Wandspachtel", "Deckfarbe"
    - Input: search="Wand"
    - Expected: "Wandfarbe weiß" und "Wandspachtel" gefunden, nicht "Deckfarbe"

11) **Archivierter Artikel in Dokumenten**
    - Setup: Artikel in Dokument referenziert, dann archiviert
    - Input: GET /articles/{id}
    - Expected: Artikel abrufbar mit is_archived=true, Response enthält Warning

12) **Rundung bei Berechnung**
    - Input: EK=33.33, Zuschlag=15.5%
    - Expected: VK = 33.33 × 1.155 = 38.50 (kaufmännisch gerundet auf 2 Stellen, exakt: 38.49615)

## Verification Checklist
- [ ] Migration erstellt und `make migrate-up` erfolgreich
- [ ] Migration ist reversibel (`make migrate-down` funktioniert)
- [ ] Alle 4 Tabellen korrekt angelegt (articles, article_categories, surcharge_rates, article_surcharge_overrides)
- [ ] Indizes erstellt (Volltext-GIN, Unique article_number, etc.)
- [ ] Model-Structs in `apps/api/internal/model/` angelegt
- [ ] Repository: Artikel CRUD + Suche + Filter + Pagination
- [ ] Repository: Kategorie CRUD + Baumstruktur
- [ ] Repository: Zuschlagssatz CRUD
- [ ] Repository: Override CRUD
- [ ] Service: VK-Berechnung korrekt (nicht kaskadierend)
- [ ] Service: Override-Logik korrekt
- [ ] Service: Rundung kaufmännisch auf 2 Dezimalstellen
- [ ] Service: Validierung aller Business Rules (1-10)
- [ ] Handler registriert in `cmd/server/main.go`
- [ ] Permissions (`articles.view/create/edit/delete/surcharges`) registriert
- [ ] OpenAPI-Spec definiert (`api/paths/`, `api/schemas/`)
- [ ] `make swagger-bundle` erfolgreich
- [ ] `make generate` erzeugt Models
- [ ] Handler verwendet generierte Models
- [ ] GET /articles/{id} enthält calculated_sales_price und surcharges
- [ ] GET /articles (Liste) enthält calculated_sales_price
- [ ] Volltextsuche über short_text, long_text, article_number funktioniert
- [ ] Teilstring-Suche funktioniert
- [ ] Suche ist case-insensitive
- [ ] Kategorie-Baum maximal 3 Ebenen
- [ ] Kategorie löschen nur wenn leer
- [ ] Artikelnummer tenant-weit eindeutig
- [ ] Soft-Delete funktioniert korrekt
- [ ] Tenant-Isolation verifiziert
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] `make lint` zeigt keine neuen Issues
- [ ] `make fmt` zeigt keine Formatierungsfehler

## Dependencies
- Terp Auth & Tenant-System (existiert)
- Terp Permission-System (existiert)

## Notes
- `time_value` wird in der Dokumenten-Kalkulation (ZMI-TICKET-122) benötigt um die Zeitanzeige pro Position zu berechnen.
- `datanorm_source` wird beim DATANORM-Import (ZMI-TICKET-105) gesetzt und dient der Nachverfolgung welcher Katalog importiert wurde.
- Die Lagerverwaltung (ZMI-TICKET-200) wird `articles` als Artikelstamm referenzieren und Bestände pro Lagerort tracken.
- Zuschlagssätze können später pro Dokument überschrieben werden (ZMI-TICKET-122) — das Tenant-Default hier ist der Ausgangswert.
- Einheiten-Liste ist initial statisch validiert, kann aber in ZMI-TICKET-107 (Unternehmensdaten) konfigurierbar gemacht werden.
