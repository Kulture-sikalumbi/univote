-- One-shot migration: branding + school activation + candidate photos.
-- Safe to re-run (IF NOT EXISTS / additive ALTERs only).

ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "Status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "LogoURL" TEXT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT "SchemaName" FROM public."Tenant" LOOP
    EXECUTE format(
      'ALTER TABLE %I."Candidate" ADD COLUMN IF NOT EXISTS "ImageURL" TEXT',
      r."SchemaName"
    );
  END LOOP;
END $$;
