-- S11 TASK 1 — Push Subscriptions
-- Tabella per le sottoscrizioni push web (Web Push API)
-- Eseguire su Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_id UUID REFERENCES productions(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Indice per lookup rapido per produzione (invio push a tutti)
CREATE INDEX IF NOT EXISTS push_subscriptions_production_id_idx
  ON push_subscriptions(production_id);

-- Indice per lookup per utente
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions(user_id);

-- Abilita RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: ogni utente gestisce SOLO le proprie subscription
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
