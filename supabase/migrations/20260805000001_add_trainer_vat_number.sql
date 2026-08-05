-- Adds a separate VAT number (USt-IdNr.) alongside the existing tax number
-- (steuernummer) on trainer_settings, so both can be printed on invoices.
ALTER TABLE trainer_settings ADD COLUMN IF NOT EXISTS vat_number TEXT;
