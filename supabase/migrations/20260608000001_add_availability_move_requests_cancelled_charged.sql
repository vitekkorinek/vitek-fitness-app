-- availability_slots: clients mark their free time for next week
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES users(id),
  week_start DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avail_client_all" ON availability_slots FOR ALL USING (client_id = auth.uid());
CREATE POLICY "avail_trainer_select" ON availability_slots FOR SELECT USING (trainer_id = auth.uid());

-- move_requests: clients request to reschedule an appointment
CREATE TABLE IF NOT EXISTS move_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id),
  trainer_id UUID NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE move_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr_client_all" ON move_requests FOR ALL USING (client_id = auth.uid());
CREATE POLICY "mr_trainer_all" ON move_requests FOR ALL USING (trainer_id = auth.uid());

-- Extend appointments.status to allow cancelled_charged (session cancelled but counted against package)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'cancelled_charged'));
