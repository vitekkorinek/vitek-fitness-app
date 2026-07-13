export type UserRole = 'trainer' | 'client';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentType = 'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'bodyweight';
export type SessionStatus = 'completed' | 'skipped';
export type RoutineStatus = 'active' | 'closed';
export type NoteLevel = 'training' | 'exercise' | 'set';
export type PackageStatus = 'active' | 'completed' | 'saved';

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  role: UserRole;
  avatar_url: string | null;
  must_change_password: boolean;
  custom_slogan: string | null;
  phone: string | null;
  date_of_birth: string | null;
  trainer_notes: string | null;
  overview_note: string | null;
  sex: 'male' | 'female' | 'other' | null;
  height_cm: number | null;
  activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | null;
  goal: 'maintain' | 'lose_025' | 'lose_05' | 'gain' | null;
  availability_type: 'fixed' | 'flexible_recurring' | 'variable' | null;
  address_street: string | null;
  address_city: string | null;
  address_postcode: string | null;
  address_country: string | null;
  banner_photo_url: string | null;
  banner_photo_offset_y: number;
  banner_photo_zoom: number;
  created_at: string;
}

export interface ClientGoal {
  id: string;
  client_id: string;
  metric: string;
  goal_value: number;
  created_by: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[];
  equipment: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  extra_video_urls: string[];
  extra_photo_urls: string[];
  difficulty: DifficultyLevel | null;
  created_by: string;
  created_at: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  equipment_list: string[];
  muscle_groups: string[];
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  order_index: number;
  notes: string | null;
  is_superset: boolean;
  superset_group_id: string | null;
  equipment_type: EquipmentType | null;
  barbell_weight_kg: number | null;
}

export interface TemplateSet {
  id: string;
  template_exercise_id: string;
  set_number: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  created_at: string;
}

export interface Routine {
  id: string;
  name: string;
  client_id: string;
  created_by: string;
  status: RoutineStatus;
  auto_name: string | null;
  created_at: string;
  closed_at: string | null;
  status_history: Array<{ status: RoutineStatus; at: string }>;
}

export interface Workout {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  client_id: string;
  routine_id: string | null;
  created_by: string;
  equipment_list: string[];
  muscle_groups: string[];
  order_index: number;
  notes: string | null;
  cover_image_url: string | null;
  category: string | null;
  stretch_type: 'upper_body' | 'lower_body' | 'full_body' | null;
  status: 'active' | 'completed';
  created_at: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
  notes: string | null;
  is_superset: boolean;
  superset_group_id: string | null;
  equipment_type: EquipmentType | null;
  barbell_weight_kg: number | null;
}

export interface WorkoutSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  created_at: string;
}

export interface Session {
  id: string;
  workout_id: string;
  client_id: string;
  date: string;
  status: SessionStatus;
  duration_seconds: number | null;
  trainer_notes: string | null;
  client_notes: string | null;
  created_at: string;
}

export interface SessionLog {
  id: string;
  session_id: string;
  workout_exercise_id: string;
  set_number: number;
  reps_completed: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  notes: string | null;
  barbell_weight_used_kg: number | null;
  is_removed: boolean;
  is_dropset: boolean;
  dropset_parent_id: string | null;
  dropset_order: number | null;
}

export interface Note {
  id: string;
  content: string;
  created_by: string;
  role: UserRole;
  level: NoteLevel;
  reference_id: string;
  created_at: string;
}

export interface Measurement {
  id: string;
  client_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  body_fat_kg: number | null;
  muscle_mass_kg: number | null;
  muscle_mass_pct: number | null;
  visceral_fat: number | null;
  bmr: number | null;
  bmr_kcal: number | null;
  body_water_pct: number | null;
  icw_kg: number | null;
  ecw_kg: number | null;
  ecw_tbw_ratio: number | null;
  fat_left_arm_kg: number | null;
  fat_right_arm_kg: number | null;
  fat_left_leg_kg: number | null;
  fat_right_leg_kg: number | null;
  fat_trunk_kg: number | null;
  muscle_left_arm_kg: number | null;
  muscle_right_arm_kg: number | null;
  muscle_left_leg_kg: number | null;
  muscle_right_leg_kg: number | null;
  muscle_trunk_kg: number | null;
  notes: string | null;
  created_by: string;
  created_by_role: 'trainer' | 'client' | null;
  created_at: string;
}

export interface TemplateAssignment {
  id: string;
  template_id: string;
  client_id: string;
  workout_id: string;
  assigned_by: string;
  assigned_at: string;
}

export interface SessionPackage {
  id: string;
  client_id: string;
  name: string;
  total_sessions: number;
  sessions_used: number;
  status: PackageStatus;
  package_type: 'Quick 40' | 'Standard 60' | 'Extended 75' | null;
  duration_minutes: 40 | 60 | 75 | null;
  price_eur: number | null;
  status_closed_early: boolean;
  activated_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface PackageDefault {
  id: string;
  package_type: 'Quick 40' | 'Standard 60' | 'Extended 75';
  total_sessions: number;
  duration_minutes: number;
  base_price_eur: number;
  created_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'updated' | 'paid';

export interface LineItem {
  description: string;
  additional_info: string;
  leistungszeitraum: string;
  quantity: number;
  unit_price_eur: number;
  total_eur: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  created_by: string | null;
  status: InvoiceStatus;
  issue_date: string;
  line_items: LineItem[];
  net_amount_eur: number;
  vat_rate: number;
  vat_amount_eur: number;
  gross_amount_eur: number;
  leistungszeitraum: string | null;
  notes: string | null;
  trainer_snapshot: Record<string, string | null> | null;
  client_snapshot: Record<string, string | null> | null;
  pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinanceManualEntry {
  id: string;
  label: string;
  amount_eur: number;
  entry_month: number | null;
  entry_year: number;
  created_by: string | null;
  created_at: string;
}
