-- Invoices for people not (yet) registered as clients: the trainer types a name
-- manually. client_id stays NULL; the name lives here (+ address in client_snapshot).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_client_name TEXT;
