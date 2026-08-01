-- Multi-equipment for exercises (Aug 1 2026).
-- `equipment` stays the MAIN implement (all existing reads keep working: bar-weight
-- detection, machine-brand picker, equipment chips). `extra_equipment` carries the
-- rest — alternative implements (Dumbbell OR Kettlebell) and cable/machine
-- attachments (Wide Bar, Triangle Grip, Rope, …). Mirrors the extra_video_urls /
-- extra_photo_urls "first + extras" pattern.
ALTER TABLE public.exercises
  ADD COLUMN extra_equipment TEXT[] NOT NULL DEFAULT '{}';
