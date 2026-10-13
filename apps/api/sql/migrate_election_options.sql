-- Add election-specific office and affiliation lists to every tenant.
-- Existing candidate positions and parties are imported into those lists.
-- Safe to re-run.

BEGIN;

DO $migration$
DECLARE
  tenant_schema_name TEXT;
BEGIN
  FOR tenant_schema_name IN
    SELECT "SchemaName" FROM public."Tenant"
  LOOP
    IF to_regclass(format('%I.%I', tenant_schema_name, 'Election')) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format($ddl$
      CREATE TABLE IF NOT EXISTS %I."ElectionOffice" (
        "OfficeID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "ElectionID" UUID NOT NULL REFERENCES %I."Election"("ElectionID") ON DELETE CASCADE,
        "Name" VARCHAR(100) NOT NULL,
        "SortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "ElectionOffice_ElectionID_Name_key" UNIQUE("ElectionID", "Name")
      )
    $ddl$, tenant_schema_name, tenant_schema_name);

    EXECUTE format($ddl$
      CREATE TABLE IF NOT EXISTS %I."ElectionAffiliation" (
        "AffiliationID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "ElectionID" UUID NOT NULL REFERENCES %I."Election"("ElectionID") ON DELETE CASCADE,
        "Name" VARCHAR(100) NOT NULL,
        CONSTRAINT "ElectionAffiliation_ElectionID_Name_key" UNIQUE("ElectionID", "Name")
      )
    $ddl$, tenant_schema_name, tenant_schema_name);

    IF to_regclass(format('%I.%I', tenant_schema_name, 'Candidate')) IS NOT NULL THEN
      EXECUTE format($backfill$
        INSERT INTO %I."ElectionOffice" ("ElectionID", "Name", "SortOrder")
        SELECT offices."ElectionID", offices."Position",
          (row_number() OVER (PARTITION BY offices."ElectionID" ORDER BY offices."Position") - 1)::INTEGER
        FROM (
          SELECT DISTINCT "ElectionID", "Position"
          FROM %I."Candidate"
        ) AS offices
        ON CONFLICT ("ElectionID", "Name") DO NOTHING
      $backfill$, tenant_schema_name, tenant_schema_name);

      EXECUTE format($backfill$
        INSERT INTO %I."ElectionAffiliation" ("ElectionID", "Name")
        SELECT DISTINCT "ElectionID", "Party"
        FROM %I."Candidate"
        WHERE "Party" IS NOT NULL AND btrim("Party") <> ''
        ON CONFLICT ("ElectionID", "Name") DO NOTHING
      $backfill$, tenant_schema_name, tenant_schema_name);
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
