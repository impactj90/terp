# ZMI-TICKET-230: Supabase Realtime ersetzt SSE NotificationStreamHub

Status: Proposed
Priority: P3
Owner: TBD

## Goal
Server-Sent Events (SSE) basiertes Notification-Streaming durch Supabase Realtime ersetzen. Die bestehende `NotificationStreamHub` in Go verwaltet SSE-Connections für Live-Benachrichtigungen — dies wird durch Supabase Realtime Subscriptions auf die `notifications`-Tabelle ersetzt.

## Scope
- **In scope:**
  - Supabase Realtime Subscription auf `notifications`-Tabelle
  - Frontend: Realtime-Provider für Live-Notification-Updates
  - Notification Badge Auto-Update bei neuen Benachrichtigungen
  - Reconnection-Handling
- **Out of scope:**
  - Notification CRUD (bereits in TICKET-221)
  - Push Notifications (Zukunft)

## Requirements

### Supabase Realtime Setup
- Channel: `notifications:user:{userId}`
- Event: `INSERT` auf `notifications`-Tabelle
- Filter: `recipient_id=eq.{userId}`
- RLS Policy: User kann nur eigene Notifications sehen

### Frontend Integration
```typescript
// Realtime Subscription Hook
const useNotificationRealtime = () => {
  const supabase = useSupabaseClient()
  const utils = trpc.useUtils()

  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`
      }, (payload) => {
        // Invalidate notifications query cache
        utils.notifications.list.invalidate()
        // Optional: Toast notification
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])
}
```

### Supabase RLS Policy
```sql
CREATE POLICY "Users can see own notifications"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

### Business Logic (aus Go portiert)
- `apps/api/internal/service/notification_stream.go` (81 Zeilen) — SSE Hub Management
- Die gesamte SSE-Connection-Verwaltung (Subscribe/Unsubscribe/Broadcast) wird durch Supabase Realtime ersetzt

## Acceptance Criteria
- [ ] Live-Benachrichtigungen werden ohne Page-Reload angezeigt
- [ ] Notification Badge aktualisiert sich automatisch
- [ ] Reconnection nach Verbindungsabbruch funktioniert
- [ ] RLS Policy stellt sicher, dass nur eigene Notifications empfangen werden
- [ ] Go SSE-Endpoint kann deaktiviert werden

## Tests
- Integration-Test: Notification erstellen → Realtime-Event wird empfangen
- Integration-Test: RLS Policy — fremde Notifications werden nicht empfangen
- E2E-Test: Notification Badge Update bei neuer Benachrichtigung

## Dependencies
- ZMI-TICKET-221 (System Settings + Notifications CRUD)
- ZMI-TICKET-202 (Supabase Auth — für auth.uid() in RLS)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/notification_stream.go` (81 Zeilen — SSE Hub)
- SSE-Handler in `apps/api/internal/handler/notification.go` (Stream-Endpoint)
