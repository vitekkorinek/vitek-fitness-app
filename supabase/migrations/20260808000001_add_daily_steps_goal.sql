-- Daily steps goal for the Consistency tab's Movement ring (Aug 8 2026).
-- Per client, on users like weekly_session_goal — but deliberately WITHOUT
-- effective-dating: a steps goal is a daily rhythm, and the active-days lookback
-- is only 7 days, so retroactive precision isn't worth the machinery.
-- NULL = the app default (8000). Editable by the client (own row — the same
-- UPDATE policy that lets them edit profile fields) and by the trainer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_steps_goal INTEGER;
