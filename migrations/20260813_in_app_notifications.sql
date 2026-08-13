CREATE TABLE IF NOT EXISTS in_app_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  template_code varchar(50) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type varchar(50),
  entity_id uuid,
  deduplication_key varchar(200) NOT NULL UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_recipient_created
  ON in_app_notification(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_recipient_unread
  ON in_app_notification(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE in_app_notification IS
  'Private, deduplicated in-application notifications addressed to one user.';
