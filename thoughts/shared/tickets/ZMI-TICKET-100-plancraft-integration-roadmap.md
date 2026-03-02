# ZMI-TICKET-100: Plancraft Integration — Roadmap & Epic-Übersicht

Status: Proposed
Priority: P1
Owner: TBD
Source: plancraft-anforderungen.md.pdf (Version 1.0, 19.02.2026)

## Goal
Terp um eine vollständige Handwerker-Betriebssoftware erweitern (Plancraft-Funktionsumfang). Die bestehende Zeitwirtschaft bleibt erhalten und wird mit den neuen Modulen verzahnt.

## Bestehendes Fundament in Terp
- Auth & Multi-Tenancy (JWT, Rollen, Tenant-Isolation)
- Mitarbeiterverwaltung (Abteilungen, Teams, Kontaktdaten)
- Zeiterfassung (Buchungen, Tages-/Wochenpläne, Terminal-Import, Tarife, Zuschläge)
- Abwesenheiten/Urlaub (Urlaubskonto, Anspruch, Krankheit)
- Schichtplanung (Basis)
- Berechtigungssystem (Rollen & Permissions)

## Epic-Übersicht (priorisiert nach Abhängigkeiten)

### Phase 1 — Stammdaten
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-101 | Kontakte/Kunden — Datenmodell & API | Proposed |
| ZMI-TICKET-102 | Kontakte/Kunden — CSV-Import & Duplikat-Erkennung | Proposed |
| ZMI-TICKET-103 | Kontakte/Kunden — Frontend UI | Proposed |
| ZMI-TICKET-104 | Artikelstamm/Leistungen — Datenmodell & API | Proposed |
| ZMI-TICKET-105 | Artikelstamm/Leistungen — DATANORM-Import | Proposed |
| ZMI-TICKET-106 | Artikelstamm/Leistungen — Frontend UI | Proposed |
| ZMI-TICKET-107 | Unternehmensdaten-Erweiterung (Briefpapier, Bank, Handwerksrolle) | Proposed |

### Phase 2 — Projektverwaltung
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-110 | Projektmappe — Datenmodell & API | Proposed |
| ZMI-TICKET-111 | Projektmappe — Dateiablage & Storage | Proposed |
| ZMI-TICKET-112 | Projektmappe — Dashboard (Plan vs. Ist) | Proposed |
| ZMI-TICKET-113 | Projektmappe — Frontend UI | Proposed |

### Phase 3 — Nummernkreise & Dokumenten-Engine
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-120 | Nummernkreise — Datenmodell, Logik & API | Proposed |
| ZMI-TICKET-121 | Dokumenten-Editor — Datenmodell (Positionen, Titel, Hierarchie) | Proposed |
| ZMI-TICKET-122 | Dokumenten-Editor — Kalkulation (Tiefenkalkulation, Zuschlagssätze) | Proposed |
| ZMI-TICKET-123 | Dokumenten-Editor — Workflow (Entwurf → Fertigstellen → Versand) | Proposed |
| ZMI-TICKET-124 | Dokumenten-Editor — Frontend UI (Drag & Drop) | Proposed |

### Phase 4 — Auftragsdokumente
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-130 | Angebote — Erstellung, Versand, Gültigkeit | Proposed |
| ZMI-TICKET-131 | Auftragsbestätigung — Generierung aus Angebot | Proposed |
| ZMI-TICKET-132 | Rechnungen — Einfache Rechnung & Lieferschein | Proposed |
| ZMI-TICKET-133 | Abschlagsrechnungen — Pauschal & Kumulativ (VOB) | Proposed |
| ZMI-TICKET-134 | Schlussrechnung — Verrechnung & MwSt-Korrektur | Proposed |

### Phase 5 — PDF & Versand
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-140 | PDF-Generierung — Engine & Briefpapier-Layout | Proposed |
| ZMI-TICKET-141 | E-Mail-Versand — Vorlagen & Anhänge | Proposed |
| ZMI-TICKET-142 | E-Rechnung (XRechnung) — XML-Generierung & Validierung | Proposed |

### Phase 6 — Baudokumentation & Aufmaß
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-150 | Aufmaß — Formelbasierte Erfassung & Integration | Proposed |
| ZMI-TICKET-151 | Bautagesbericht — Datenmodell & Workflow | Proposed |
| ZMI-TICKET-152 | Regiebericht — Zusatzarbeiten & Abzeichnung | Proposed |
| ZMI-TICKET-153 | Abnahmeprotokoll — Mängelliste & Unterschriften | Proposed |
| ZMI-TICKET-154 | Digitale Unterschriften — Capture & Embedding | Proposed |
| ZMI-TICKET-155 | Berichtsvorlagen — Admin-Konfigurator | Proposed |
| ZMI-TICKET-156 | Materialerfassung — Baustelle vs. Kalkulation | Proposed |

### Phase 7 — Finanzen & Kalkulation
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-160 | Nachkalkulation — Plan vs. Ist Dashboard | Proposed |
| ZMI-TICKET-161 | Eingangsrechnungen — Upload, KI-Scan, Zuordnung | Proposed |
| ZMI-TICKET-162 | Mahnwesen — Automatisierter Workflow | Proposed |
| ZMI-TICKET-163 | Zahlungsbedingungen — Konfiguration & Textvorlagen | Proposed |
| ZMI-TICKET-164 | Rechnungslisten & Finanz-Dashboard | Proposed |
| ZMI-TICKET-165 | Lohnkosten-Ausweis (§35a EStG) | Proposed |

### Phase 8 — Kommunikation
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-170 | Projektbasierter Chat — Echtzeit-Messaging | Proposed |
| ZMI-TICKET-171 | Benachrichtigungen — Push & In-App | Proposed |
| ZMI-TICKET-172 | Arbeitsanweisungen & Materiallisten | Proposed |

### Phase 9 — Schnittstellen
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-180 | GAEB Import/Export (DA83, DA84) | Proposed |
| ZMI-TICKET-181 | DATANORM Import (V4, V5) | Proposed |
| ZMI-TICKET-182 | DATEV Export | Proposed |
| ZMI-TICKET-183 | Excel Import/Export | Proposed |
| ZMI-TICKET-184 | ÖNORM (Österreich) | Proposed |
| ZMI-TICKET-185 | API-Keys & Webhooks | Proposed |

### Phase 10 — Erweiterungen
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-190 | Kundenportal (PORTA) | Proposed |
| ZMI-TICKET-191 | Kolonnenverwaltung | Proposed |
| ZMI-TICKET-192 | Plantafel — Projekt-Einsatzplanung (Erweiterung) | Proposed |
| ZMI-TICKET-193 | Mobile App (Basis) | Proposed |
| ZMI-TICKET-194 | Offline-Fähigkeit Mobile | Proposed |

### Phase 11 — Lagerverwaltung
| Ticket | Epic | Status |
|--------|------|--------|
| ZMI-TICKET-200 | Lagerorte & Bestandsführung — Datenmodell & API | Proposed |
| ZMI-TICKET-201 | Wareneingänge & Warenausgänge — Buchungslogik | Proposed |
| ZMI-TICKET-202 | Umlagerungen — Lager ↔ Baustelle ↔ Fahrzeug | Proposed |
| ZMI-TICKET-203 | Mindestbestände & Bestellvorschläge | Proposed |
| ZMI-TICKET-204 | Inventur — Zählung, Differenzbuchung, Protokoll | Proposed |
| ZMI-TICKET-205 | Lagerverwaltung — Frontend UI | Proposed |

## Architektur-Entscheidungen
- Alle neuen Module folgen Terp Clean Architecture: handler → service → repository → model
- Neue Entitäten sind tenant-scoped (tenant_id FK)
- OpenAPI-first: Spec vor Implementierung
- Frontend in bestehendem Next.js eingebaut
- PDF-Generierung: Headless Chrome oder WeasyPrint (TBD)
- Dateispeicher: S3-kompatibel (TBD)
- Suche: PostgreSQL Full-Text zunächst, Meilisearch bei Bedarf

## Abhängigkeitsbaum (kritischer Pfad)
```
Kontakte/Kunden (101-103)
  └─→ Projektverwaltung (110-113)
        ├─→ Baudokumentation (150-156)
        ├─→ Chat (170-172)
        └─→ Nachkalkulation (160-165)

Artikelstamm (104-106)
  └─→ Dokumenten-Editor (121-124)
        └─→ Auftragsdokumente (130-134)
              ├─→ PDF & Versand (140-142)
              └─→ Finanzen (160-165)

Nummernkreise (120)
  └─→ Dokumenten-Workflow (123)
        └─→ Auftragsdokumente (130-134)

Artikelstamm (104-106)
  └─→ Lagerverwaltung (200-205)
        ├─→ Materialerfassung Baustelle (156)
        └─→ Eingangsrechnungen (161)
```

## Notes
- Bestehende Zeiterfassung wird mit Projektverwaltung verknüpft (Mitarbeiter buchen auf Projekte)
- Bestehende Mitarbeiterverwaltung wird von Baudokumentation genutzt (anwesende Mitarbeiter)
- Plantafel-Erweiterung baut auf bestehender Schichtplanung auf
