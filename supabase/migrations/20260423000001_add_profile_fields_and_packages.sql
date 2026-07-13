-- ============================================================
-- Migration: user profile fields + session packages
-- ============================================================

-- Add new columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS custom_slogan  TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth  DATE,
  ADD COLUMN IF NOT EXISTS trainer_notes  TEXT;

-- ============================================================
-- Session Packages
-- ============================================================

CREATE TYPE package_status AS ENUM ('active', 'completed', 'saved');

CREATE TABLE public.session_packages (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            TEXT           NOT NULL,
  total_sessions  INTEGER        NOT NULL,
  sessions_used   INTEGER        NOT NULL DEFAULT 0,
  status          package_status NOT NULL DEFAULT 'saved',
  activated_at    TIMESTAMPTZ,
  created_by      UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_packages_client_id ON public.session_packages (client_id);
CREATE INDEX idx_session_packages_status    ON public.session_packages (status);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_packages: trainer all"
  ON public.session_packages FOR ALL
  USING (is_trainer());

CREATE POLICY "session_packages: client reads own"
  ON public.session_packages FOR SELECT
  USING (client_id = auth.uid());
