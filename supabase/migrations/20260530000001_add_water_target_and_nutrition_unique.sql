-- Add water_target_ml to client_nutrition_targets
ALTER TABLE client_nutrition_targets
  ADD COLUMN IF NOT EXISTS water_target_ml integer;

-- Add unique constraint on client_id so upsert works
ALTER TABLE client_nutrition_targets
  ADD CONSTRAINT client_nutrition_targets_client_id_key UNIQUE (client_id);
