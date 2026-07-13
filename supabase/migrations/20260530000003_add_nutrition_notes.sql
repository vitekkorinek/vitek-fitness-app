ALTER TABLE client_nutrition_targets
  ADD COLUMN IF NOT EXISTS nutrition_notes text;
