-- Update sex check to include 'other'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sex_check;
ALTER TABLE users ADD CONSTRAINT users_sex_check
  CHECK (sex IN ('male', 'female', 'other'));

-- Add activity_level
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS activity_level text
  CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active'));

-- Add goal
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS goal text
  CHECK (goal IN ('maintain', 'lose_025', 'lose_05', 'gain'));
