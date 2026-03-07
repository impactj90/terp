-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only SELECT their own notifications
-- This is required for Supabase Realtime to filter events per-user
CREATE POLICY "Users can select own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- RLS policy: allow service role (Go backend) full insert access
-- The Go backend uses a direct DB connection (not Supabase client), so
-- RLS does not apply to it. This policy is for completeness if any
-- Supabase client-side operations need INSERT.
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Set REPLICA IDENTITY FULL so that Realtime receives complete row data
-- on UPDATE/DELETE events (needed for user_id filtering)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Add notifications table to the Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
