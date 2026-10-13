-- apps/api/sql/provision_tenant.sql
--
-- Run this once against the database to install the provisioning procedure.
-- Run it against Supabase via the SQL editor, or `psql "$DATABASE_URL" -f sql/provision_tenant.sql`.
--
-- The procedure is idempotent per-schema (CREATE SCHEMA IF NOT EXISTS,
-- CREATE TABLE IF NOT EXISTS). Re-running this file backfills codes for
-- existing institutions and refreshes the procedure definition.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS public."Tenant" (
  "TenantID"    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "SchoolName"  VARCHAR(255) NOT NULL,
  "TenantCode"  VARCHAR(63) NOT NULL UNIQUE,
  "DomainURL"   VARCHAR(255) UNIQUE,
  "SchemaName"  VARCHAR(63)  NOT NULL UNIQUE,
  "CreatedAt"   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "Status"      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  "LogoURL"     TEXT,
  "SisBaseURL"  TEXT,
  "SisApiKey"   TEXT
);

-- Idempotent for databases provisioned before these columns existed.
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "SisBaseURL" TEXT;
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "SisApiKey" TEXT;
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "Status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "LogoURL" TEXT;
ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "TenantCode" VARCHAR(63);
ALTER TABLE public."Tenant" ALTER COLUMN "TenantCode" TYPE VARCHAR(63);
ALTER TABLE public."Tenant" ALTER COLUMN "DomainURL" DROP NOT NULL;

-- Replace older random codes with a readable, unique slug of each school name.
-- Temporary values keep the unique index valid while names are reassigned.
UPDATE public."Tenant"
SET "TenantCode" = 'migrating_' || replace("TenantID"::text, '-', '');

DO $$
DECLARE
  tenant_row RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER;
  suffix_text TEXT;
BEGIN
  FOR tenant_row IN
    SELECT "TenantID", "SchoolName" FROM public."Tenant" ORDER BY "TenantID"
  LOOP
    base_slug := trim(both '_' from regexp_replace(lower(tenant_row."SchoolName"), '[^a-z0-9]+', '_', 'g'));
    IF base_slug = '' THEN
      base_slug := 'school';
    ELSIF base_slug ~ '^[0-9]' THEN
      base_slug := 'school_' || base_slug;
    END IF;
    base_slug := regexp_replace(left(base_slug, 63), '_+$', '');
    IF base_slug = '' THEN
      base_slug := 'school';
    END IF;
    candidate := base_slug;
    suffix := 2;

    WHILE EXISTS (
      SELECT 1 FROM public."Tenant"
      WHERE "TenantCode" = candidate AND "TenantID" <> tenant_row."TenantID"
    ) LOOP
      suffix_text := '_' || suffix::text;
      candidate := regexp_replace(left(base_slug, 63 - length(suffix_text)), '_+$', '') || suffix_text;
      suffix := suffix + 1;
    END LOOP;

    UPDATE public."Tenant" SET "TenantCode" = candidate
    WHERE "TenantID" = tenant_row."TenantID";
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_TenantCode_key"
  ON public."Tenant" ("TenantCode");
ALTER TABLE public."Tenant" ALTER COLUMN "TenantCode" SET NOT NULL;

-- Replace the old three-argument procedure. The default preserves existing
-- seed scripts and integrations that still call it with three arguments.
DROP PROCEDURE IF EXISTS provision_tenant(TEXT, TEXT, TEXT);

CREATE OR REPLACE PROCEDURE provision_tenant(
  p_school_name TEXT,
  p_domain_url  TEXT,
  p_schema_name TEXT,
  p_tenant_code TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_code TEXT;
BEGIN
  v_tenant_code := COALESCE(p_tenant_code, lower(p_schema_name));

  -- 1. Register in public Tenant table (ACTIVE by default; callers that
  -- need PENDING school self-registration flip Status after this CALL).
  INSERT INTO public."Tenant" ("SchoolName", "TenantCode", "DomainURL", "SchemaName", "Status")
  VALUES (p_school_name, v_tenant_code, p_domain_url, p_schema_name, 'ACTIVE')
  RETURNING "TenantID" INTO v_tenant_id;

  -- 2. Create isolated schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

  -- 3. Voter
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."Voter" (
      "VoterID"       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "TenantID"      UUID NOT NULL,
      "StudentID"     VARCHAR(50) NOT NULL,
      "PasswordHash"  TEXT NOT NULL,
      "EnrolledAt"    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "IsActive"      BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE("StudentID", "TenantID")
    )
  $ddl$, p_schema_name);

  -- Existing tenant schemas gain the first-login password setup flag too.
  EXECUTE format(
    'ALTER TABLE %I."Voter" ADD COLUMN IF NOT EXISTS "MustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE',
    p_schema_name
  );

  -- 4. Credential
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."Credential" (
      "CredentialID"          VARCHAR(500) PRIMARY KEY,
      "VoterID"               UUID NOT NULL REFERENCES %I."Voter"("VoterID"),
      "Salted_PublicKey_Hash" TEXT NOT NULL,
      "Encrypted_PublicKey"   TEXT NOT NULL,
      "SignCount"             BIGINT NOT NULL DEFAULT 0,
      "CreatedAt"             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "LastUsedAt"            TIMESTAMP WITH TIME ZONE
    )
  $ddl$, p_schema_name, p_schema_name);

  -- 4b. SchoolAdmin
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."SchoolAdmin" (
      "AdminID"      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "TenantID"     UUID NOT NULL,
      "Username"     VARCHAR(100) NOT NULL,
      "PasswordHash" TEXT NOT NULL,
      "CreatedAt"    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE("Username", "TenantID")
    )
  $ddl$, p_schema_name);

  -- 5. Election
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."Election" (
      "ElectionID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "TenantID"    UUID NOT NULL,
      "Title"       VARCHAR(255) NOT NULL,
      "StartTime"   TIMESTAMP WITH TIME ZONE NOT NULL,
      "EndTime"     TIMESTAMP WITH TIME ZONE NOT NULL,
      "Status"      VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      "CreatedAt"   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  $ddl$, p_schema_name);

  -- 5b. Offices and affiliations offered in this election.
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."ElectionOffice" (
      "OfficeID"   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "ElectionID" UUID NOT NULL REFERENCES %I."Election"("ElectionID") ON DELETE CASCADE,
      "Name"       VARCHAR(100) NOT NULL,
      "SortOrder"  INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "ElectionOffice_ElectionID_Name_key" UNIQUE("ElectionID", "Name")
    )
  $ddl$, p_schema_name, p_schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."ElectionAffiliation" (
      "AffiliationID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "ElectionID"    UUID NOT NULL REFERENCES %I."Election"("ElectionID") ON DELETE CASCADE,
      "Name"          VARCHAR(100) NOT NULL,
      CONSTRAINT "ElectionAffiliation_ElectionID_Name_key" UNIQUE("ElectionID", "Name")
    )
  $ddl$, p_schema_name, p_schema_name);

  -- 6. Candidate
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."Candidate" (
      "CandidateID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "ElectionID"   UUID NOT NULL REFERENCES %I."Election"("ElectionID"),
      "FullName"     VARCHAR(255) NOT NULL,
      "Position"     VARCHAR(100) NOT NULL,
      "Party"        TEXT,
      "ManifestoURL" TEXT,
      "ImageURL"     TEXT
    )
  $ddl$, p_schema_name, p_schema_name);

  -- Idempotent for existing tenant schemas created before ImageURL existed.
  EXECUTE format(
    'ALTER TABLE %I."Candidate" ADD COLUMN IF NOT EXISTS "ImageURL" TEXT',
    p_schema_name
  );
  EXECUTE format(
    'ALTER TABLE %I."Candidate" ADD COLUMN IF NOT EXISTS "Party" TEXT',
    p_schema_name
  );

  -- 7. Ballot — no VoterID column. Anonymity is a hard constraint.
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."Ballot" (
      "BallotID"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "ElectionID"          UUID NOT NULL REFERENCES %I."Election"("ElectionID"),
      "CandidateID"         UUID NOT NULL REFERENCES %I."Candidate"("CandidateID"),
      "Ballot_Hash"         TEXT NOT NULL,
      "Encrypted_Timestamp" TEXT NOT NULL,
      "IsVerified"          BOOLEAN NOT NULL DEFAULT TRUE,
      CHECK ("IsVerified" = TRUE)
    )
  $ddl$, p_schema_name, p_schema_name, p_schema_name);

  -- 8. ElectionParticipant — the anonymity bridge (who voted, not what for)
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I."ElectionParticipant" (
      "ParticipantID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "ElectionID"     UUID NOT NULL REFERENCES %I."Election"("ElectionID"),
      "VoterID"        UUID NOT NULL REFERENCES %I."Voter"("VoterID"),
      "ParticipatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE("ElectionID", "VoterID")
    )
  $ddl$, p_schema_name, p_schema_name, p_schema_name);

END;
$$;
