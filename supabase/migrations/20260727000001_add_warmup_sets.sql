-- Warm-up sets (July 2026)
--
-- A set can be flagged as a warm-up. Warm-ups always sit at the TOP of an
-- exercise's set list and render as "W" instead of a number, so the working
-- sets still read 1 · 2 · 3.
--
-- ⚠️ NUMBERING: `set_number` is counted WITHIN its block — warm-ups are
-- 1..n and working sets are 1..m, so the same exercise can hold a warm-up 1
-- and a working set 1. The pair (set_number, is_warmup) is what identifies a
-- set. This is deliberate: it keeps a working set's logged history attached to
-- the same number forever, so adding a warm-up to an existing workout can
-- never shift set 1's weight history onto set 2.

ALTER TABLE workout_sets  ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE template_sets ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE session_logs  ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT false;

-- Reads order by warm-up first, then set_number.
CREATE INDEX IF NOT EXISTS workout_sets_we_warmup_idx  ON workout_sets  (workout_exercise_id, is_warmup DESC, set_number);
CREATE INDEX IF NOT EXISTS template_sets_te_warmup_idx ON template_sets (template_exercise_id, is_warmup DESC, set_number);
