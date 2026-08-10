ALTER TABLE email_outbox
  DROP CONSTRAINT IF EXISTS ck_email_outbox_template;

ALTER TABLE email_outbox
  ADD CONSTRAINT ck_email_outbox_template CHECK (
    template_code IN (
      'PAYMENT_REMINDER',
      'UTILITY_READING_REJECTED',
      'INVOICE_ISSUED',
      'PAYMENT_PROOF_REJECTED',
      'PAYMENT_APPROVED'
    )
  );

COMMENT ON TABLE email_outbox IS
  'Durable, deduplicated delivery state for tenant email notifications.';
