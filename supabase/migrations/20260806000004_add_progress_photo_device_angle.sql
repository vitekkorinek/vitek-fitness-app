-- The phone's tilt at the moment the shot was taken, in degrees.
-- Camera ANGLE is what actually ruins a before/after — more than the person
-- shifting a few centimetres — and unlike the body's position it is something the
-- device can genuinely measure. The next shot in the same slot compares against
-- the most recent photo's angle and goes green when it matches.
-- NULL for photos taken before this shipped, and for anything picked from the
-- library (there is no angle to record) — both must stay valid.
alter table public.progress_photos
  add column if not exists device_pitch numeric(6,2),
  add column if not exists device_roll  numeric(6,2);
