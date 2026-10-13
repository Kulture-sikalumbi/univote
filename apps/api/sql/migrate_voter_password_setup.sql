-- Run once after deploying first-login password setup.
-- Adds the flag to every tenant that is already registered. New tenants get
-- the same column from provision_tenant.sql.
DO $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN SELECT "SchemaName" FROM public."Tenant" LOOP
    EXECUTE format(
      'ALTER TABLE %I."Voter" ADD COLUMN IF NOT EXISTS "MustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE',
      tenant_row."SchemaName"
    );
  END LOOP;
END;
$$;
