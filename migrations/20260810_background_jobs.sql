CREATE TABLE IF NOT EXISTS background_job_run (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name        varchar(80) NOT NULL,
  scheduled_for   timestamptz NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'RUNNING',
  result          jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code      varchar(100),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  CONSTRAINT uq_background_job_run UNIQUE (job_name, scheduled_for),
  CONSTRAINT ck_background_job_run_status
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT ck_background_job_run_completion CHECK (
    (status = 'RUNNING' AND completed_at IS NULL)
    OR (status IN ('SUCCEEDED', 'FAILED') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_background_job_run_status_started
  ON background_job_run(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_job_run_name_scheduled
  ON background_job_run(job_name, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_email       text NOT NULL,
  template_code         varchar(50) NOT NULL,
  payload               jsonb NOT NULL,
  deduplication_key     text NOT NULL UNIQUE,
  status                varchar(20) NOT NULL DEFAULT 'PENDING',
  attempts              integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 5,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  sent_at               timestamptz,
  last_error_code       varchar(100),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_email_outbox_template
    CHECK (template_code IN ('PAYMENT_REMINDER')),
  CONSTRAINT ck_email_outbox_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  CONSTRAINT ck_email_outbox_attempts
    CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20 AND attempts <= max_attempts),
  CONSTRAINT ck_email_outbox_sent
    CHECK ((status = 'SENT' AND sent_at IS NOT NULL) OR status <> 'SENT')
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_delivery
  ON email_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'PROCESSING');

DROP TRIGGER IF EXISTS trg_email_outbox_updated_at ON email_outbox;
CREATE TRIGGER trg_email_outbox_updated_at
BEFORE UPDATE ON email_outbox
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
