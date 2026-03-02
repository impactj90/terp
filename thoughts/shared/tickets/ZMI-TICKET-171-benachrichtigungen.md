# ZMI-TICKET-171: Benachrichtigungen — Push & In-App

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 8 — Kommunikation
Source: plancraft-anforderungen.md.pdf, Abschnitt 7.2 Benachrichtigungen
Blocked by: ZMI-TICKET-170

## Goal
Benachrichtigungssystem für neue Chat-Nachrichten, Projekt-Änderungen, Zeiterfassungs-Erinnerungen. In-App-Notifications + Push (Mobile App, Zukunft). Konfigurierbar pro Nutzer.

## Scope
- **In scope:** Datenmodell (notifications, notification_preferences), In-App-Benachrichtigungen, Event-basierte Generierung, Nutzer-Präferenzen (an/aus, Uhrzeiten).
- **Out of scope:** Mobile Push (ZMI-TICKET-193), E-Mail-Notifications (Zukunft).

## Requirements

### Datenmodell

#### Tabelle `notifications`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| user_id | UUID | FK users, NOT NULL | Empfänger |
| type | VARCHAR(50) | NOT NULL | 'chat_message', 'project_update', 'time_reminder', 'document_status' |
| title | VARCHAR(255) | NOT NULL | |
| body | TEXT | | |
| link | VARCHAR(500) | | Deep-Link (z.B. /projects/{id}/chat) |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `notification_preferences`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| user_id | UUID | FK users, NOT NULL | |
| notification_type | VARCHAR(50) | NOT NULL | |
| enabled | BOOLEAN | NOT NULL, DEFAULT true | |
| quiet_hours_start | TIME | NULL | z.B. 22:00 |
| quiet_hours_end | TIME | NULL | z.B. 07:00 |

### Notification-Typen
| Typ | Trigger | Text |
|-----|---------|------|
| chat_message | Neue Chat-Nachricht | "{Sender}: {Nachricht}" |
| project_update | Projekt-Status geändert | "Projekt {Name} wurde auf {Status} gesetzt" |
| time_reminder | Abends keine Zeiterfassung | "Zeiterfassung nicht eingetragen" |
| document_status | Dokument fertiggestellt/versendet | "{Dokument} wurde fertiggestellt" |

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /notifications | Benachrichtigungen (paginiert) |
| GET | /notifications/unread-count | Ungelesene Anzahl |
| PATCH | /notifications/{id}/read | Als gelesen markieren |
| POST | /notifications/read-all | Alle als gelesen |
| GET | /notification-preferences | Präferenzen |
| PATCH | /notification-preferences | Präferenzen ändern |

### Permissions
- Jeder Nutzer sieht nur eigene Notifications.

## Acceptance Criteria
1. In-App-Benachrichtigungen für alle Typen.
2. Ungelesen-Counter.
3. Als gelesen markierbar.
4. Nutzer-Präferenzen (an/aus, Ruhezeiten).

## Tests
### Unit Tests
- `TestNotification_Create`: Event → Notification generiert.
- `TestNotification_QuietHours`: Innerhalb Ruhezeiten → nicht gesendet.
- `TestNotification_Disabled`: Typ deaktiviert → keine Notification.
- `TestNotification_MarkRead`: is_read=true nach Markierung.

### API Tests
- `TestNotificationHandler_List_200`, `TestNotificationHandler_UnreadCount_200`, `TestNotificationHandler_MarkRead_200`

## Verification Checklist
- [ ] Migration: notifications, notification_preferences
- [ ] Event-basierte Generierung
- [ ] Nutzer-Präferenzen
- [ ] Ruhezeiten respektiert
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-170 (Chat — für chat_message Events)
