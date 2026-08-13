-- PostgreSQL does not provide min(uuid), while the following legacy ownership
-- migration uses it to select the only manager. Keep the applied migration
-- immutable and provide the missing aggregate before it runs on a fresh schema.

CREATE OR REPLACE FUNCTION uuid_min_state(uuid, uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS 'SELECT LEAST($1, $2)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname=current_schema()
      AND procedure.proname='min'
      AND procedure.prokind='a'
      AND pg_get_function_identity_arguments(procedure.oid)='uuid'
  ) THEN
    CREATE AGGREGATE min(uuid) (
      SFUNC=uuid_min_state,
      STYPE=uuid,
      SORTOP = <
    );
  END IF;
END $$;
