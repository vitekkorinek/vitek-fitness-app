CREATE TABLE IF NOT EXISTS availability_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, week_start)
);

ALTER TABLE availability_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avail_notif_client_all" ON availability_notifications FOR ALL USING (client_id = auth.uid());
CREATE POLICY "avail_notif_trainer_all" ON availability_notifications FOR ALL USING (trainer_id = auth.uid());
ALTER TABLE availability_notifications ADD COLUMN IF NOT EXISTS is_update BOOLEAN NOT NULL DEFAULT false;
