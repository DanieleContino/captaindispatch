-- =====================================================
-- Task 1 — TL Header/Footer: Schema DB
-- Project: lvxtvgxyancpegvfcnsk (West EU Ireland)
-- Run in: https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- =====================================================

-- 1) Template library (per-user)
CREATE TABLE IF NOT EXISTS public.tl_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_templates_owner
  ON public.tl_templates(owner_user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tl_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tl_templates_updated_at ON public.tl_templates;
CREATE TRIGGER trg_tl_templates_updated_at
  BEFORE UPDATE ON public.tl_templates
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_templates_all ON public.tl_templates;
CREATE POLICY tl_templates_all
  ON public.tl_templates FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- 2) Blocchi di un template (header + footer in un'unica tabella)
CREATE TABLE IF NOT EXISTS public.tl_template_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.tl_templates(id) ON DELETE CASCADE,
  zone          TEXT NOT NULL CHECK (zone IN ('header','footer')),
  display_order INTEGER NOT NULL DEFAULT 0,
  block_type    TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  width         TEXT NOT NULL DEFAULT '1fr',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_template_blocks_tpl
  ON public.tl_template_blocks(template_id, zone, display_order);

DROP TRIGGER IF EXISTS trg_tl_template_blocks_updated_at ON public.tl_template_blocks;
CREATE TRIGGER trg_tl_template_blocks_updated_at
  BEFORE UPDATE ON public.tl_template_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_template_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_template_blocks_all ON public.tl_template_blocks;
CREATE POLICY tl_template_blocks_all
  ON public.tl_template_blocks FOR ALL
  USING (
    template_id IN (
      SELECT id FROM public.tl_templates WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM public.tl_templates WHERE owner_user_id = auth.uid()
    )
  );

-- 3) Template applicato a una produzione + override
CREATE TABLE IF NOT EXISTS public.tl_production_template (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id     UUID NOT NULL UNIQUE REFERENCES public.productions(id) ON DELETE CASCADE,
  template_id       UUID REFERENCES public.tl_templates(id) ON DELETE SET NULL,
  overrides         JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_storage_path TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_production_template_prod
  ON public.tl_production_template(production_id);

DROP TRIGGER IF EXISTS trg_tl_production_template_updated_at ON public.tl_production_template;
CREATE TRIGGER trg_tl_production_template_updated_at
  BEFORE UPDATE ON public.tl_production_template
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_production_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_production_template_all ON public.tl_production_template;
CREATE POLICY tl_production_template_all
  ON public.tl_production_template FOR ALL
  USING (production_id IN (SELECT user_production_ids()))
  WITH CHECK (production_id IN (SELECT user_production_ids()));

-- 4) Override per-produzione dei contatti team
CREATE TABLE IF NOT EXISTS public.tl_team_contacts_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   UUID NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id         TEXT REFERENCES public.crew(id) ON DELETE SET NULL,
  display_order   INTEGER NOT NULL DEFAULT 0,
  name_override   TEXT,
  role_override   TEXT,
  phone_override  TEXT,
  email_override  TEXT,
  hidden          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_team_overrides_prod
  ON public.tl_team_contacts_overrides(production_id, display_order);

ALTER TABLE public.tl_team_contacts_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_team_contacts_overrides_all ON public.tl_team_contacts_overrides;
CREATE POLICY tl_team_contacts_overrides_all
  ON public.tl_team_contacts_overrides FOR ALL
  USING (production_id IN (SELECT user_production_ids()))
  WITH CHECK (production_id IN (SELECT user_production_ids()));
