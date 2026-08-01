-- Persistent per-trainer custom equipment options (Aug 1 2026).
-- [{ "name": "Sled", "kind": "main" | "attachment" }] — shown as permanent
-- pills in the exercise builder's equipment card, tap to select, long-press to
-- edit/delete. Values save onto exercises as plain text like any other pick.
ALTER TABLE public.trainer_settings
  ADD COLUMN custom_equipment JSONB NOT NULL DEFAULT '[]';
