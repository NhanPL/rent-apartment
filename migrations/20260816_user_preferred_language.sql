ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'en';

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS ck_app_user_preferred_language;
ALTER TABLE app_user ADD CONSTRAINT ck_app_user_preferred_language
  CHECK (preferred_language IN ('en', 'vi'));

COMMENT ON COLUMN app_user.preferred_language IS
  'Preferred locale for account email and user-requested exports.';
