-- S33: Captain Bridge Upgrade — DB Migration
-- Eseguire in Supabase SQL Editor

-- ─────────────────────────────────────────────────────────────
-- TABELLA: notifications
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('success', 'warning', 'error', 'info')),
  message       text NOT NULL,
  read          boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));

CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- ─────────────────────────────────────────────────────────────
-- TABELLA: activity_log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id),
  action_type   text NOT NULL,
  description   text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select" ON activity_log FOR SELECT TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));
