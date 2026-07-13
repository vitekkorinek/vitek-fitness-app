ALTER TABLE food_log_entries
  DROP CONSTRAINT IF EXISTS food_log_entries_meal_category_check;

ALTER TABLE food_log_entries
  ADD CONSTRAINT food_log_entries_meal_category_check
  CHECK (meal_category IN (
    'breakfast','lunch','dinner','snack',
    'snack_morning','snack_afternoon','snack_evening',
    'snack_pre_workout','snack_post_workout'
  ));
