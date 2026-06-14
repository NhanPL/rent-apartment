-- Add explicit online gateway payment methods used by payment records.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'VNPAY' AFTER 'CARD';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'MOMO';
