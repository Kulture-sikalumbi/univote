-- Add optional party/affiliation information to candidates in every tenant.
-- Run once against the database after deploying the application change.
-- Safe to re-run; existing candidates remain without a party value.

BEGIN;

DO $migration$
DECLARE
  tenant_schema_name TEXT;
BEGIN
  FOR tenant_schema_name IN
    SELECT "SchemaName" FROM public."Tenant"
  LOOP
    IF to_regclass(format('%I.%I', tenant_schema_name, 'Candidate')) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS %I TEXT',
        tenant_schema_name,
        'Candidate',
        'Party'
      );
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
