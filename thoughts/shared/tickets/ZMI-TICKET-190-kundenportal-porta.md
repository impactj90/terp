# ZMI-TICKET-190: Kundenportal (PORTA)

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 10 — Erweiterungen
Source: plancraft-anforderungen.md.pdf, Abschnitt 12 PORTA (Kundenportal)
Blocked by: ZMI-TICKET-130, ZMI-TICKET-132, ZMI-TICKET-140, ZMI-TICKET-111

## Goal
Kundenportal für Endkunden (Auftraggeber). Kunden können Angebote online einsehen und bestätigen, Rechnungen einsehen, Projektfortschritt verfolgen und digital kommunizieren. Separater Login-Bereich mit eingeschränkten Rechten.

## Scope
- **In scope:** Kunden-Login (Token-basiert, kein voller Account), Angebots-Ansicht + Online-Bestätigung, Rechnungs-Ansicht + PDF-Download, Projekt-Fortschrittsanzeige, Nachrichten-Funktion (Kunde ↔ Handwerker), Portal-Einladung per E-Mail.
- **Out of scope:** Kunden-Self-Registration, Zahlungsintegration (Stripe/PayPal), Kunden-Dateiverwaltung.

## Requirements

### Datenmodell

#### Tabelle `portal_invitations`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| contact_id | UUID | FK contacts, NOT NULL | Zugeordneter Kontakt |
| email | VARCHAR(255) | NOT NULL | E-Mail des Kunden |
| token_hash | VARCHAR(255) | NOT NULL, UNIQUE | SHA256-Hash des Einladungstokens |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 'pending', 'accepted', 'expired', 'revoked' |
| expires_at | TIMESTAMPTZ | NOT NULL | Ablauf (Default: 7 Tage) |
| accepted_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `portal_sessions`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| contact_id | UUID | FK contacts, NOT NULL | |
| session_token_hash | VARCHAR(255) | NOT NULL, UNIQUE | |
| last_activity_at | TIMESTAMPTZ | NOT NULL | |
| expires_at | TIMESTAMPTZ | NOT NULL | Session-Ablauf (24h) |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `portal_messages`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| contact_id | UUID | FK contacts, NOT NULL | |
| project_id | UUID | FK projects, NULL | Optionaler Projektbezug |
| direction | VARCHAR(10) | NOT NULL | 'inbound' (Kunde→Firma), 'outbound' (Firma→Kunde) |
| body | TEXT | NOT NULL | Nachrichtentext |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `portal_document_shares`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| contact_id | UUID | FK contacts, NOT NULL | |
| document_id | UUID | FK documents, NOT NULL | |
| can_accept | BOOLEAN | NOT NULL, DEFAULT false | Angebot bestätigen erlaubt |
| shared_at | TIMESTAMPTZ | NOT NULL | |
| viewed_at | TIMESTAMPTZ | NULL | Erste Einsicht |
| accepted_at | TIMESTAMPTZ | NULL | Bestätigung (nur Angebote) |

### Business Rules
1. Einladung per E-Mail mit einmaligem Token → Kunde klickt Link → Session wird erstellt.
2. Token ist 7 Tage gültig; nach Annahme wird Token ungültig, Session-Token generiert.
3. Session-Token läuft nach 24h Inaktivität ab; verlängerbar bei Aktivität.
4. Kunde sieht nur explizit freigegebene Dokumente (`portal_document_shares`).
5. Angebots-Bestätigung: Kunde klickt "Angebot annehmen" → `accepted_at` wird gesetzt → Event `offer.accepted_by_customer` wird ausgelöst → Handwerker wird benachrichtigt.
6. Rechnungs-Ansicht: Nur finalisierte Rechnungen, kein Bearbeitungszugriff.
7. Projektfortschritt: Basiert auf `project.status` + letzte Aktivitäten (Dokumente, Berichte).
8. Nachrichten: Einfacher Textaustausch, kein Datei-Upload durch Kunden.
9. Portal-Branding: Logo + Farben des Mandanten werden angezeigt.
10. Widerruf: Admin kann Einladung/Session jederzeit widerrufen → sofort gesperrt.

### API / OpenAPI

#### Portal-interne API (Kunden-Auth)
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /portal/auth/accept-invitation | Einladung annehmen |
| POST | /portal/auth/login | Session mit Token starten |
| POST | /portal/auth/logout | Session beenden |
| GET | /portal/documents | Freigegebene Dokumente auflisten |
| GET | /portal/documents/{id} | Dokument-Details |
| GET | /portal/documents/{id}/pdf | PDF herunterladen |
| POST | /portal/documents/{id}/accept | Angebot bestätigen |
| GET | /portal/projects | Projekte mit Fortschritt |
| GET | /portal/projects/{id} | Projekt-Details |
| GET | /portal/messages | Nachrichten auflisten |
| POST | /portal/messages | Nachricht senden |

#### Admin-API (Internes Management)
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /portal/invitations | Kunden einladen |
| GET | /portal/invitations | Einladungen auflisten |
| DELETE | /portal/invitations/{id} | Einladung widerrufen |
| POST | /portal/shares | Dokument freigeben |
| DELETE | /portal/shares/{id} | Freigabe entfernen |
| GET | /portal/messages/contact/{contactId} | Nachrichten eines Kunden |
| POST | /portal/messages/contact/{contactId} | Nachricht an Kunden senden |

### Permissions
- `portal.manage` — Einladungen, Freigaben, Nachrichten verwalten

## Acceptance Criteria
1. Einladung per E-Mail versendbar.
2. Kunde kann Angebot einsehen und online bestätigen.
3. Kunde kann Rechnungen einsehen und PDF herunterladen.
4. Projektfortschritt sichtbar.
5. Nachrichten-Austausch funktioniert.
6. Session-Management mit Ablauf.
7. Widerruf funktioniert sofort.

## Tests
### Unit Tests
- `TestPortalInvitation_Create`: Einladung → Token generiert, Hash gespeichert.
- `TestPortalInvitation_Accept`: Gültiges Token → Session erstellt, Token ungültig.
- `TestPortalInvitation_Expired`: Abgelaufenes Token → 410 Gone.
- `TestPortalInvitation_Revoked`: Widerrufenes Token → 410 Gone.
- `TestPortalSession_Valid`: Gültige Session → Zugriff erlaubt.
- `TestPortalSession_Expired`: Abgelaufene Session → 401.
- `TestPortalSession_ActivityExtend`: Aktivität → Session verlängert.
- `TestPortalDocument_OnlyShared`: Nicht freigegebenes Dokument → 404.
- `TestPortalDocument_AcceptOffer`: Angebot bestätigen → accepted_at gesetzt, Event ausgelöst.
- `TestPortalDocument_AcceptInvoice`: Rechnung bestätigen → 403 (nur Angebote).
- `TestPortalDocument_PDFDownload`: PDF → korrekt zurückgegeben.
- `TestPortalProject_OnlyAssigned`: Nur Projekte des Kontakts sichtbar.
- `TestPortalMessage_Send`: Kunde sendet Nachricht → direction='inbound'.
- `TestPortalMessage_Reply`: Firma antwortet → direction='outbound'.
- `TestPortalMessage_ReadStatus`: Nachricht gelesen → is_read=true.
- `TestPortalBranding_TenantLogo`: Logo des Mandanten wird zurückgegeben.
- `TestPortalRevoke_ImmediateLogout`: Session widerrufen → nächster Request 401.

### API Tests
- `TestPortalInvitationHandler_Create_201`
- `TestPortalInvitationHandler_Accept_200`
- `TestPortalInvitationHandler_Expired_410`
- `TestPortalDocumentHandler_List_200`
- `TestPortalDocumentHandler_Accept_200`
- `TestPortalDocumentHandler_PDF_200`
- `TestPortalProjectHandler_List_200`
- `TestPortalMessageHandler_Send_201`
- `TestPortalMessageHandler_List_200`
- `TestPortalAdminHandler_Share_201`
- `TestPortalAdminHandler_Revoke_200`

### Integration Tests
- `TestPortal_FullFlow`: Einladung → Annahme → Dokument ansehen → Angebot bestätigen → Nachricht senden.
- `TestPortal_RevokeFlow`: Einladung → Annahme → Widerruf → nächster Request 401.
- `TestPortal_MultiTenant`: Kunde von Tenant A sieht keine Daten von Tenant B.

### Test Case Pack
| # | Szenario | Erwartung |
|---|----------|-----------|
| 1 | Einladung erstellen | Token-Mail versendet, Hash in DB |
| 2 | Token annehmen | Session erstellt, Token verbraucht |
| 3 | Abgelaufenes Token | 410 Gone |
| 4 | Angebot online bestätigen | accepted_at gesetzt, Event |
| 5 | Rechnung als PDF herunterladen | PDF korrekt |
| 6 | Nachricht senden (Kunde) | direction='inbound' |
| 7 | Nachricht senden (Firma) | direction='outbound' |
| 8 | Session-Ablauf | 401 nach 24h Inaktivität |
| 9 | Widerruf | Sofort 401 |
| 10 | Nicht freigegebenes Dokument | 404 |

## Verification Checklist
- [ ] Migration: portal_invitations, portal_sessions, portal_messages, portal_document_shares
- [ ] Einladungs-Token-Generierung + Hashing
- [ ] E-Mail-Versand der Einladung
- [ ] Session-Management mit Ablauf
- [ ] Dokument-Freigabe-Logik
- [ ] Angebots-Online-Bestätigung
- [ ] PDF-Download via Portal
- [ ] Projektfortschritts-Anzeige
- [ ] Nachrichten-System
- [ ] Widerruf von Einladungen/Sessions
- [ ] Tenant-Branding (Logo, Farben)
- [ ] Multi-Tenancy korrekt isoliert
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-130 (Angebote), ZMI-TICKET-132 (Rechnungen), ZMI-TICKET-140 (PDF), ZMI-TICKET-111 (Projektverwaltung)

## Notes
- Portal-Bereich ist eine eigene Route-Gruppe mit separater Auth-Middleware (nicht JWT-basiert, sondern Portal-Session-Token).
- Kein voller User-Account notwendig — leichtgewichtige Session per Token.
- Langfristig: Push-Benachrichtigungen für neue Dokumente/Nachrichten (separates Ticket).
