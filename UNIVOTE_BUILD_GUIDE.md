# UniVote — Agent Build Guide
> **For use with Claude Sonnet 5 / claude-sonnet-5 or equivalent coding agents**
> Author: Taonga Sikalumbi · Student ID: 2300104 · ZUT
> Read this entire file before writing a single line of code.

---

## 0. How to Use This Guide

This file is the single source of truth for building UniVote from scratch. Work through it **top to bottom, phase by phase**. Each phase ends with a clear checkpoint. Do not advance to the next phase until all checkpoint items are verified.

When prompting an agent, paste the relevant phase section plus any specific context it needs. The agent does not need to re-read previous phases unless you explicitly cross-reference them.

---

## 1. Project Overview

**UniVote** is a multi-tenant Progressive Web Application (PWA) that provides secure, automated digital student elections for multiple Zambian higher learning institutions (tenants) running on a single shared infrastructure.

### Core Architectural Pillars

| Pillar | What it means | Key mechanism |
|---|---|---|
| **Security** | CIA Triad: Confidentiality, Integrity, Availability | WebAuthn Biometric MFA · JWT · BCrypt · SHA-256 · AES-256 · TLS 1.3 |
| **Multi-Tenancy** | One app, many institutions, zero data bleed | Schema-per-Tenant in PostgreSQL · Tenant Resolution Middleware |
| **Automation** | No human in the verification loop | SIS API eligibility engine · ballot token lifecycle |

### The Three Portals

| Portal | User | Core responsibilities |
|---|---|---|
| Super Admin | Platform owner | Onboard institutions, provision tenant schemas |
| School Admin | Institution staff | Configure elections, register candidates, manage voter roll, export results |
| Student | Voter | Login → biometric handshake → cast ballot |

---

## 2. Tech Stack (Exact Versions)

```
Frontend:   React.js 18.x  ·  Tailwind CSS 3.x  ·  Workbox 7.x (PWA / Service Worker)
Backend:    Node.js 20 LTS  ·  Express.js 4.x  ·  Prisma ORM 5.x
Database:   PostgreSQL 16.x
Security:   SimpleWebAuthn 9.x  ·  BCrypt 5.x  ·  Node built-in crypto (SHA-256, AES-256)
Testing:    Jest 29.x  ·  Playwright 1.x (with virtual WebAuthn authenticator)
DevOps:     Docker 25.x  ·  GitHub Actions (CI/CD)  ·  Nginx (reverse proxy + TLS 1.3)
```

---

## 3. Repository Structure

Set up this exact folder layout before writing any code:

```
univote/
├── apps/
│   ├── web/                        # React.js PWA (all three portals)
│   │   ├── public/
│   │   │   └── manifest.json       # PWA manifest
│   │   ├── src/
│   │   │   ├── portals/
│   │   │   │   ├── SuperAdmin/
│   │   │   │   ├── SchoolAdmin/
│   │   │   │   └── Student/
│   │   │   ├── components/         # Shared UI components
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── lib/
│   │   │   │   ├── webauthn.ts     # WebAuthn client helpers
│   │   │   │   └── api.ts          # Axios/fetch wrapper
│   │   │   └── service-worker.ts   # Workbox service worker
│   │   └── vite.config.ts
│   │
│   └── api/                        # Node.js + Express backend
│       ├── src/
│       │   ├── middleware/
│       │   │   ├── tenantResolver.ts   # ← CRITICAL: resolves TenantID on every request
│       │   │   ├── authGuard.ts        # JWT validation middleware
│       │   │   └── rateLimiter.ts
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   │   ├── auth.routes.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   └── webauthn.service.ts  # Roaming Identity Module
│       │   │   ├── eligibility/
│       │   │   │   ├── eligibility.routes.ts
│       │   │   │   └── eligibility.service.ts  # SIS API integration
│       │   │   ├── election/
│       │   │   ├── ballot/
│       │   │   │   └── ballot.service.ts    # Ballot Integrity Engine
│       │   │   ├── superadmin/
│       │   │   │   └── tenant.service.ts    # Schema provisioning
│       │   │   └── schooladmin/
│       │   ├── prisma/
│       │   │   ├── schema.prisma
│       │   │   └── migrations/
│       │   ├── crypto/
│       │   │   ├── hash.ts              # SHA-256 ballot hashing
│       │   │   ├── encrypt.ts           # AES-256 timestamp encryption
│       │   │   └── salt.ts              # System-specific salt management
│       │   └── app.ts
│       └── tests/
│           ├── unit/
│           └── e2e/
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── docker-compose.yml
│   └── nginx/
│       └── nginx.conf
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
└── UNIVOTE_BUILD_GUIDE.md          # This file
```

---

## 4. Database Schema (Schema-per-Tenant)

### 4.1 Architecture Rule

There are **two schema zones** in PostgreSQL:

1. **`public` schema** — global, shared. Contains only the `Tenant` table.
2. **`{tenant_schema}` schema** — one per institution (e.g., `zut`, `unza`). Contains all election data.

**No query should ever cross schema boundaries. This is an absolute rule.**

### 4.2 `public.Tenant` Table (shared schema)

```sql
CREATE TABLE public."Tenant" (
  "TenantID"    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "SchoolName"  VARCHAR(255) NOT NULL,
  "DomainURL"   VARCHAR(255) NOT NULL UNIQUE,   -- e.g., zut.univote.zm
  "SchemaName"  VARCHAR(63)  NOT NULL UNIQUE,   -- e.g., "zut"
  "CreatedAt"   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.3 Per-Tenant Tables (exist inside each tenant schema)

**`Voter` table**
```sql
CREATE TABLE "Voter" (
  "VoterID"       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantID"      UUID NOT NULL,         -- references public.Tenant
  "StudentID"     VARCHAR(50) NOT NULL,
  "PasswordHash"  TEXT NOT NULL,         -- BCrypt cost factor 12
  "EnrolledAt"    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "IsActive"      BOOLEAN NOT NULL DEFAULT FALSE,  -- set by Eligibility Engine
  UNIQUE("StudentID", "TenantID")
);
```

**`Credential` table** — WebAuthn / Roaming Identity
```sql
CREATE TABLE "Credential" (
  "CredentialID"         VARCHAR(500) PRIMARY KEY,  -- WebAuthn credentialId (base64url)
  "VoterID"              UUID NOT NULL REFERENCES "Voter"("VoterID"),
  "Salted_PublicKey_Hash" TEXT NOT NULL,             -- NEVER store raw public key
  "SignCount"            BIGINT NOT NULL DEFAULT 0,  -- monotonically increasing; clone detection
  "CreatedAt"            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "LastUsedAt"           TIMESTAMP WITH TIME ZONE
);
```

**`Election` table**
```sql
CREATE TABLE "Election" (
  "ElectionID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenantID"    UUID NOT NULL,
  "Title"       VARCHAR(255) NOT NULL,
  "StartTime"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "EndTime"     TIMESTAMP WITH TIME ZONE NOT NULL,
  "Status"      VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ACTIVE | CLOSED
  "CreatedAt"   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`Candidate` table**
```sql
CREATE TABLE "Candidate" (
  "CandidateID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ElectionID"   UUID NOT NULL REFERENCES "Election"("ElectionID"),
  "FullName"     VARCHAR(255) NOT NULL,
  "Position"     VARCHAR(100) NOT NULL,
  "ManifestoURL" TEXT
);
```

**`Ballot` table** — immutable once written
```sql
CREATE TABLE "Ballot" (
  "BallotID"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ElectionID"          UUID NOT NULL REFERENCES "Election"("ElectionID"),
  "CandidateID"         UUID NOT NULL REFERENCES "Candidate"("CandidateID"),
  "Ballot_Hash"         TEXT NOT NULL,   -- SHA-256(CandidateID + BallotID + timestamp)
  "Encrypted_Timestamp" TEXT NOT NULL,   -- AES-256 encrypted ISO 8601 timestamp
  "IsVerified"          BOOLEAN NOT NULL DEFAULT TRUE,
  -- ⚠️ NO VoterID column. Ballot anonymity is a hard constraint.
  CHECK ("IsVerified" = TRUE)            -- ballots are always written verified
);
```

### 4.4 Tenant Provisioning Stored Procedure

When a new institution is onboarded, execute this atomically:

```sql
CREATE OR REPLACE PROCEDURE provision_tenant(
  p_school_name TEXT,
  p_domain_url  TEXT,
  p_schema_name TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Register in public Tenant table
  INSERT INTO public."Tenant" ("SchoolName", "DomainURL", "SchemaName")
  VALUES (p_school_name, p_domain_url, p_schema_name);

  -- 2. Create isolated schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

  -- 3. Apply all tenant tables inside the new schema
  EXECUTE format('
    SET search_path TO %I;
    -- (paste CREATE TABLE statements for Voter, Credential, Election, Candidate, Ballot here)
  ', p_schema_name);

  COMMIT;
END;
$$;
```

---

## 5. Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Note: Tenant is in the public schema — defined here for type safety.
// Per-tenant tables are accessed by dynamically setting search_path.

model Tenant {
  TenantID   String   @id @default(uuid()) @db.Uuid
  SchoolName String
  DomainURL  String   @unique
  SchemaName String   @unique
  CreatedAt  DateTime @default(now())

  @@schema("public")
}
```

> **Agent note:** Per-tenant models (Voter, Credential, Election, Candidate, Ballot) are accessed by setting `search_path` dynamically before each query using `prisma.$executeRaw`. Build a `getPrismaForTenant(tenantSchema: string)` factory function that returns a Prisma client with the correct schema context.

---

## 6. Core Backend Components

### 6.1 Tenant Resolution Middleware

**This is the most critical middleware. It runs on EVERY API request.**

```typescript
// src/middleware/tenantResolver.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  // Strategy 1: resolve from subdomain (e.g., zut.univote.zm → "zut")
  const host = req.hostname;
  const subdomain = host.split('.')[0];

  const tenant = await prisma.tenant.findUnique({
    where: { DomainURL: host }
  });

  if (!tenant) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  // Attach to request context — all downstream handlers use this
  req.tenantID = tenant.TenantID;
  req.tenantSchema = tenant.SchemaName;

  next();
}

// All DB queries after this middleware MUST use:
// SET search_path TO {req.tenantSchema}
// before any data operation.
```

### 6.2 Roaming Identity Module (WebAuthn)

This is the biometric authentication engine. Implement as a self-contained service.

**Registration flow (`registerCredential`):**
```typescript
// src/modules/auth/webauthn.service.ts
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { hashWithSystemSalt } from '../crypto/salt';
import { getPrismaForTenant } from '../lib/tenantPrisma';

export async function generateRegistrationChallenge(voterID: string, studentID: string) {
  const options = await generateRegistrationOptions({
    rpName: 'UniVote',
    rpID: process.env.RP_ID!,             // e.g., 'univote.zm'
    userID: voterID,
    userName: studentID,
    attestationType: 'none',              // No hardware attestation required
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Device-native sensor only
      userVerification: 'required',
      residentKey: 'preferred',
    },
  });
  // Store challenge temporarily (Redis or in-memory with short TTL)
  return options;
}

export async function verifyAndStoreCredential(
  tenantSchema: string,
  voterID: string,
  registrationResponse: any,
  expectedChallenge: string
) {
  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Biometric registration failed verification');
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

  // CRITICAL: Apply system-specific salt BEFORE storing public key
  // Raw public key NEVER touches the database
  const saltedHash = await hashWithSystemSalt(
    Buffer.from(credentialPublicKey).toString('base64')
  );

  const db = await getPrismaForTenant(tenantSchema);
  await db.$executeRaw`
    INSERT INTO "Credential" ("CredentialID", "VoterID", "Salted_PublicKey_Hash", "SignCount")
    VALUES (${credentialID}, ${voterID}, ${saltedHash}, ${counter})
  `;

  return { success: true };
}
```

**Authentication flow (`verifyAssertion`):**
```typescript
export async function verifyBiometricAssertion(
  tenantSchema: string,
  voterID: string,
  assertionResponse: any,
  expectedChallenge: string
) {
  const db = await getPrismaForTenant(tenantSchema);

  // Fetch stored credential
  const credential = await db.$queryRaw<any[]>`
    SELECT * FROM "Credential" WHERE "VoterID" = ${voterID}
  `;
  if (!credential.length) throw new Error('No credential registered');

  const { CredentialID, Salted_PublicKey_Hash, SignCount } = credential[0];

  // Reconstruct public key from salted hash for verification
  // (SimpleWebAuthn requires the original public key bytes;
  //  store the FULL public key encrypted with AES-256 separately,
  //  use salted hash as integrity check)
  // ⚠️ Implementation note: Store AES-256 encrypted public key alongside salted hash.
  //    Decrypt only during verification. Never log or expose the decrypted key.

  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response: assertionResponse,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    authenticator: {
      credentialID: Buffer.from(CredentialID, 'base64url'),
      credentialPublicKey: /* AES-decrypted public key bytes */,
      counter: Number(SignCount),
    },
  });

  if (!verified) throw new Error('Biometric assertion failed');

  // CRITICAL: SignCount must be strictly increasing — detects credential cloning
  if (authenticationInfo.newCounter <= Number(SignCount)) {
    throw new Error('SignCount did not increment — possible credential cloning attack');
  }

  // Update SignCount
  await db.$executeRaw`
    UPDATE "Credential"
    SET "SignCount" = ${authenticationInfo.newCounter}, "LastUsedAt" = NOW()
    WHERE "VoterID" = ${voterID}
  `;

  return { verified: true };
}
```

### 6.3 Eligibility Engine

```typescript
// src/modules/eligibility/eligibility.service.ts

export interface EligibilityResult {
  eligible: boolean;
  reasonCode?: 'NOT_ENROLLED' | 'FINANCIAL_HOLD' | 'ALREADY_VOTED' | 'ELECTION_CLOSED';
}

export async function checkEligibility(
  tenantSchema: string,
  studentID: string,
  electionID: string,
  sisBaseURL: string,    // each tenant configures their own SIS endpoint
  sisApiKey: string
): Promise<EligibilityResult> {

  // 1. Query institutional SIS API
  const sisResponse = await fetch(`${sisBaseURL}/students/${studentID}/status`, {
    headers: { 'Authorization': `Bearer ${sisApiKey}` }
  });

  if (!sisResponse.ok) {
    return { eligible: false, reasonCode: 'NOT_ENROLLED' };
  }

  const sisData = await sisResponse.json();

  // 2. Check enrollment status
  if (sisData.enrollmentStatus !== 'ACTIVE') {
    return { eligible: false, reasonCode: 'NOT_ENROLLED' };
  }

  // 3. Check financial clearance
  if (sisData.financialHold === true) {
    return { eligible: false, reasonCode: 'FINANCIAL_HOLD' };
  }

  // 4. Check if already voted in this election
  const db = await getPrismaForTenant(tenantSchema);
  const existingBallot = await db.$queryRaw<any[]>`
    SELECT b."BallotID"
    FROM "Ballot" b
    JOIN "Voter" v ON v."VoterID" = /* token voter id */
    WHERE b."ElectionID" = ${electionID}
    -- Note: No VoterID on Ballot table by design.
    -- Use a separate ElectionParticipant table to track who has voted
    -- WITHOUT linking to their actual ballot choice.
  `;
  // ⚠️ See Section 6.4 for ElectionParticipant pattern

  return { eligible: true };
}
```

### 6.4 ElectionParticipant Table (Anonymity Bridge)

Since the `Ballot` table has **no VoterID** (required for anonymity), track participation separately:

```sql
-- Add this to each tenant schema
CREATE TABLE "ElectionParticipant" (
  "ParticipantID"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ElectionID"     UUID NOT NULL REFERENCES "Election"("ElectionID"),
  "VoterID"        UUID NOT NULL REFERENCES "Voter"("VoterID"),
  "ParticipatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE("ElectionID", "VoterID")   -- enforces one-vote-per-student
);
```

This table tells you **who voted**, not **what they voted for**. The `Ballot` table tells you **what votes were cast**, not **who cast them**. No single query can join these two facts together.

### 6.5 Ballot Integrity Engine

```typescript
// src/modules/ballot/ballot.service.ts
import crypto from 'crypto';
import { encryptTimestamp } from '../crypto/encrypt';
import { getPrismaForTenant } from '../lib/tenantPrisma';

export async function castBallot(
  tenantSchema: string,
  electionID: string,
  candidateID: string,
  voterID: string,       // used only for ElectionParticipant, not stored on ballot
  ballotToken: string    // JWT ballot token — invalidated after use
) {
  const db = await getPrismaForTenant(tenantSchema);

  const ballotID = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // SHA-256 hash — tamper-evident audit trail (FR-05)
  const hashInput = `${candidateID}:${ballotID}:${timestamp}`;
  const ballotHash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // AES-256 encrypt the timestamp
  const encryptedTimestamp = encryptTimestamp(timestamp);

  // Write ballot and participation record atomically
  await db.$transaction(async (tx: any) => {
    // Write immutable ballot (NO VoterID)
    await tx.$executeRaw`
      INSERT INTO "Ballot" ("BallotID", "ElectionID", "CandidateID", "Ballot_Hash", "Encrypted_Timestamp")
      VALUES (${ballotID}, ${electionID}, ${candidateID}, ${ballotHash}, ${encryptedTimestamp})
    `;

    // Record participation (links VoterID to election, not to candidate)
    await tx.$executeRaw`
      INSERT INTO "ElectionParticipant" ("ElectionID", "VoterID")
      VALUES (${electionID}, ${voterID})
    `;
  });

  // Invalidate the JWT ballot token (store in Redis blocklist or DB)
  await invalidateBallotToken(ballotToken);

  return { ballotID, confirmation: ballotHash.substring(0, 16) };  // partial hash as receipt
}
```

### 6.6 JWT Token Strategy

```typescript
// src/modules/auth/jwt.service.ts
import jwt from 'jsonwebtoken';

// Two token types in UniVote:

// 1. SESSION TOKEN — issued after credential login
//    Payload: { voterID, tenantID, tenantSchema, role }
//    TTL: 30 minutes
//    Used for: all authenticated API calls

// 2. BALLOT TOKEN — issued after successful biometric handshake
//    Payload: { voterID, electionID, tenantID, type: 'BALLOT' }
//    TTL: 15 minutes (shorter — covers only the voting window)
//    Single-use: invalidated immediately on ballot submission

export function issueSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30m' });
}

export function issueBallotToken(voterID: string, electionID: string, tenantID: string): string {
  return jwt.sign(
    { voterID, electionID, tenantID, type: 'BALLOT' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );
}

// In authGuard middleware: verify token, check it's not in the blocklist
```

---

## 7. API Endpoint Contracts

All routes are prefixed `/api/v1`. All requests require `Authorization: Bearer <token>` except `/auth/login` and `/auth/register`.

### Authentication API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Create voter account (credential only) |
| POST | `/auth/login` | None | Validate credentials → session token |
| POST | `/auth/webauthn/register/begin` | Session | Start biometric enrollment |
| POST | `/auth/webauthn/register/complete` | Session | Finish biometric enrollment |
| POST | `/auth/webauthn/login/begin` | Session | Get WebAuthn challenge |
| POST | `/auth/webauthn/login/complete` | Session | Verify assertion → ballot token |

### Eligibility API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/eligibility/check/:electionID` | Session | Run eligibility check for authenticated voter |

### Ballot API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/ballot/:electionID` | Ballot Token | Fetch ballot (candidates) |
| POST | `/ballot/:electionID/cast` | Ballot Token | Submit vote |

### Election Management API (School Admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/elections` | Admin | List all elections |
| POST | `/elections` | Admin | Create election |
| PUT | `/elections/:id/status` | Admin | Open/close election |
| GET | `/elections/:id/results` | Admin | Real-time result tally |
| POST | `/elections/:id/candidates` | Admin | Add candidate |
| GET | `/voters` | Admin | List voter roll |
| POST | `/voters/sync` | Admin | Sync voter roll from SIS |

### Super Admin API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/superadmin/tenants` | SuperAdmin | Provision new institution |
| GET | `/superadmin/tenants` | SuperAdmin | List all institutions |
| DELETE | `/superadmin/tenants/:id` | SuperAdmin | Decommission institution |

---

## 8. Cryptography Implementation

### 8.1 System-Specific Salt (NFR-06)

```typescript
// src/crypto/salt.ts
import crypto from 'crypto';

// The SYSTEM_SALT is a single secret value unique to this UniVote deployment.
// It is stored in the environment / key management service — NEVER in the DB.
// It ensures biometric templates from UniVote cannot be replayed elsewhere.

const SYSTEM_SALT = process.env.UNIVOTE_BIOMETRIC_SALT!;
// Generate once with: openssl rand -base64 64

export async function hashWithSystemSalt(value: string): Promise<string> {
  const saltedValue = SYSTEM_SALT + value;
  return crypto.createHash('sha256').update(saltedValue).digest('hex');
}
```

### 8.2 AES-256 Timestamp Encryption

```typescript
// src/crypto/encrypt.ts
import crypto from 'crypto';

const KEY = Buffer.from(process.env.AES_KEY!, 'hex');  // 32 bytes = 64 hex chars
const IV_LENGTH = 16;

export function encryptTimestamp(timestamp: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(timestamp, 'utf8'),
    cipher.final()
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptTimestamp(encryptedData: string): string {
  const [ivHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

### 8.3 BCrypt for Passwords

```typescript
import bcrypt from 'bcrypt';
const COST_FACTOR = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST_FACTOR);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
```

---

## 9. Frontend — Portal Routing

```typescript
// src/App.tsx
// Portal is determined by the authenticated user's role from the JWT

const portalMap = {
  SUPER_ADMIN: <SuperAdminPortal />,
  SCHOOL_ADMIN: <SchoolAdminPortal />,
  STUDENT: <StudentPortal />,
};

// The Student Portal state machine:
// UNAUTHENTICATED → CREDENTIAL_LOGIN → ELIGIBILITY_CHECK → BIOMETRIC_HANDSHAKE → BALLOT → CONFIRMED
```

### Student Voter Flow (strict sequence — do not deviate)

```
1. CREDENTIAL_LOGIN
   - StudentID + Password → POST /auth/login
   - On success: store session JWT

2. ELIGIBILITY_CHECK
   - GET /eligibility/check/:electionID
   - If ineligible: show reason code + contact info, block progress

3. BIOMETRIC_HANDSHAKE
   - POST /auth/webauthn/login/begin → get challenge
   - navigator.credentials.get(options) → assertion from device sensor
   - POST /auth/webauthn/login/complete → verify assertion → receive ballot JWT
   - If first time: show registration flow first (steps /register/begin → /register/complete)

4. BALLOT SCREEN
   - GET /ballot/:electionID (with ballot JWT)
   - Show candidates. Student selects one.
   - Confirmation screen ("You are voting for X — confirm?")

5. CAST
   - POST /ballot/:electionID/cast
   - Show confirmation receipt (partial hash, e.g. "Vote recorded: a3f9b2...")
   - Invalidate ballot JWT locally, redirect to "Voting complete" screen
```

---

## 10. PWA Configuration

```json
// public/manifest.json
{
  "name": "UniVote",
  "short_name": "UniVote",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1C4E80",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```typescript
// Service Worker — Workbox strategy
// Cache static assets (CSS, JS, fonts) with StaleWhileRevalidate
// Network-first for all /api/* routes (no ballot caching)
// Offline fallback page for complete network failures
```

---

## 11. Environment Variables

```bash
# .env.example — copy to .env and fill in production values

# Database
DATABASE_URL=postgresql://univote_user:password@localhost:5432/univote

# JWT
JWT_SECRET=<openssl rand -base64 64>

# WebAuthn / FIDO2
RP_ID=univote.zm                    # Relying Party ID (domain, no subdomain)
ORIGIN=https://zut.univote.zm       # Expected origin (set per tenant in middleware)

# Cryptography
AES_KEY=<openssl rand -hex 32>      # 32 bytes for AES-256
UNIVOTE_BIOMETRIC_SALT=<openssl rand -base64 64>   # System-specific biometric salt

# Application
PORT=3001
NODE_ENV=production
```

---

## 12. Testing Requirements

Every PR must pass all tests before merge. These are not optional.

### 12.1 Unit Tests (Jest)

Write unit tests for each of these functions before implementing them:

| Test | What to verify |
|---|---|
| `hashWithSystemSalt` | Same input + same salt → same output. Different salt → different output. |
| `encryptTimestamp` / `decryptTimestamp` | Round-trip correctness. IV is random (two encryptions of same string differ). |
| `hashPassword` / `verifyPassword` | BCrypt round-trip. Wrong password returns false. |
| `issueSessionToken` / `issueBallotToken` | Correct payload structure. Expiry enforced. |
| `tenantResolver` middleware | Known domain → correct tenantID/schema. Unknown domain → 404. |
| `castBallot` | BallotID generated. Hash computed correctly. VoterID NOT in ballot record. |
| `checkSignCount` | Counter increment accepted. Same or lower counter → throw. |

### 12.2 Integration Tests (Jest + real DB)

| Test | What to verify |
|---|---|
| **Tenant Isolation** | Query from Tenant A's schema cannot retrieve Tenant B's data under any parameterisation. |
| **Eligibility Engine** | SIS mock returns ACTIVE → eligible. INACTIVE or financial hold → correct reason code. |
| **Ballot Integrity** | Modify stored ballot record → hash mismatch detected on verification. |

### 12.3 E2E Tests (Playwright with virtual WebAuthn)

```typescript
// Key test: Roaming Identity and Cross-Device Protocol Test
// This is the primary UAT acceptance criterion.

test('Voter enrolled on Device A can authenticate on Device B', async ({ browser }) => {
  // Stage 1: Enroll on Device A
  const deviceA = await browser.newPage();
  // ... perform registration flow with virtual authenticator A

  // Stage 2: Authenticate on Device B (different virtual authenticator)
  const deviceB = await browser.newPage();
  // ... perform assertion flow with virtual authenticator B
  // Assert: ballot token issued successfully

  // Stage 3: Attempt auth with a DIFFERENT person's biometric on Device B
  // Assert: assertion rejected, no ballot token issued
});

test('Multi-tenant isolation — ZUT voter cannot access UNZA election', async ({ page }) => {
  // Login as ZUT student, attempt to GET /ballot/:unza_election_id
  // Assert: 403 or 404, zero UNZA data visible
});

test('One-student-one-vote — second vote attempt rejected', async ({ page }) => {
  // Cast ballot successfully
  // Attempt to cast again with same ballot token → 401 (token invalidated)
  // Attempt to get new ballot token → check ElectionParticipant → 403
});
```

---

## 13. Docker Setup

```yaml
# docker/docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: univote
      POSTGRES_USER: univote_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    environment:
      DATABASE_URL: postgresql://univote_user:${POSTGRES_PASSWORD}@postgres:5432/univote
    depends_on:
      - postgres
    ports:
      - "3001:3001"

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:3000"

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    ports:
      - "443:443"
      - "80:80"
    depends_on:
      - api
      - web

volumes:
  postgres_data:
```

```nginx
# docker/nginx/nginx.conf — simplified
server {
    listen 443 ssl;
    ssl_protocols TLSv1.3;               # TLS 1.3 only (NFR-04)
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    # Route /api/* to Node.js
    location /api/ {
        proxy_pass http://api:3001;
    }

    # Route everything else to React PWA
    location / {
        proxy_pass http://web:3000;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## 14. GitHub Actions CI Pipeline

```yaml
# .github/workflows/ci.yml
name: UniVote CI

on:
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: univote_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/univote_test
          JWT_SECRET: test_secret_do_not_use_in_prod
          AES_KEY: 0000000000000000000000000000000000000000000000000000000000000000
          UNIVOTE_BIOMETRIC_SALT: test_salt

      - name: Run integration tests
        run: npm run test:integration

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
```

---

## 15. Build Phases and Checkpoints

Work through these in order. Do not skip phases.

### Phase 1 — Foundation (Data Tier)
- [ ] PostgreSQL running in Docker
- [ ] `public.Tenant` table created
- [ ] Tenant provisioning stored procedure working
- [ ] Prisma configured with `DATABASE_URL`
- [ ] `getPrismaForTenant(schema)` factory function working
- [ ] **Checkpoint:** Provision two tenants (ZUT, UNZA). Confirm schemas are separate. Run the isolation unit test.

### Phase 2 — Auth Skeleton (Logic Tier)
- [ ] Express app bootstrapped with tenantResolver middleware
- [ ] `/auth/register` and `/auth/login` endpoints working (credential only)
- [ ] JWT session token issuance working
- [ ] BCrypt password hashing in place
- [ ] authGuard middleware working
- [ ] **Checkpoint:** Register a student, login, receive session token, call a protected endpoint.

### Phase 3 — Biometric Layer
- [ ] SimpleWebAuthn installed and configured
- [ ] System-specific salt generation and storage in place
- [ ] `/auth/webauthn/register/begin` and `/complete` working
- [ ] `/auth/webauthn/login/begin` and `/complete` working
- [ ] SignCount clone detection in place
- [ ] Ballot JWT issued after successful biometric assertion
- [ ] **Checkpoint:** Run the Roaming Identity Playwright test (Device A enroll → Device B auth → non-registered biometric rejected).

### Phase 4 — Eligibility Engine
- [ ] SIS mock API set up (for development)
- [ ] `/eligibility/check/:electionID` endpoint working
- [ ] All reason codes returning correctly
- [ ] `ElectionParticipant` table in place
- [ ] **Checkpoint:** Eligible student → proceeds. Student with financial hold → blocked with correct reason code.

### Phase 5 — Ballot & Elections
- [ ] Election CRUD for School Admin
- [ ] Candidate management
- [ ] `/ballot/:electionID` (GET) returns candidates for authenticated voter
- [ ] `/ballot/:electionID/cast` (POST) — SHA-256 hash computed, AES-256 timestamp encrypted, VoterID excluded from Ballot row
- [ ] Ballot token invalidation after cast
- [ ] One-vote enforcement via ElectionParticipant
- [ ] **Checkpoint:** Cast a ballot. Verify Ballot_Hash. Verify VoterID absent from Ballot table. Attempt second vote → rejected.

### Phase 6 — Frontend Portals
- [ ] React app with Tailwind CSS bootstrapped
- [ ] Student Portal — full 5-step voting flow
- [ ] School Admin Portal — election management, live results
- [ ] Super Admin Portal — institution onboarding
- [ ] PWA manifest and service worker registered
- [ ] **Checkpoint:** Complete a full voting session end-to-end on a mobile viewport. Ballot receipt displayed.

### Phase 7 — Testing & CI
- [ ] All unit tests passing (see Section 12.1)
- [ ] All integration tests passing (see Section 12.2)
- [ ] All E2E tests passing (see Section 12.3)
- [ ] GitHub Actions pipeline green on a feature branch PR
- [ ] **Checkpoint:** CI passes. Every critical function has a test. No PR merges without green CI.

### Phase 8 — Deployment
- [ ] Docker Compose running all services
- [ ] Nginx configured with TLS 1.3
- [ ] Environment variables set (not committed to git)
- [ ] Zero-downtime tenant provisioning tested
- [ ] **Checkpoint:** Access the app on `https://zut.univote.zm` (or localhost equivalent). Complete a full election cycle.

---

## 16. Security Constraints Checklist

These are hard rules. The agent must not violate any of them:

- [ ] **No raw biometric data** ever transmitted to or stored on the server. Raw sensor readings stay on the device.
- [ ] **No VoterID on the Ballot table.** Anonymity is non-negotiable.
- [ ] **SignCount must increase** on every successful WebAuthn assertion. Non-increasing counter → block immediately.
- [ ] **Ballot tokens are single-use.** Invalidate in the same transaction as ballot submission.
- [ ] **JWT max TTL:** Session = 30 min, Ballot = 15 min. No refresh tokens for ballot JWTs.
- [ ] **All DB queries are schema-scoped.** tenantResolver sets schema context before any handler runs.
- [ ] **SYSTEM_SALT never stored in DB.** Lives in environment / KMS only.
- [ ] **AES key never logged.** Log key IDs or aliases only.
- [ ] **TLS 1.3 only** on the Nginx reverse proxy. Reject TLS 1.2.
- [ ] **BCrypt cost factor = 12.** Do not lower this.
- [ ] **No SQL string interpolation.** All queries through Prisma or parameterised `$executeRaw`.

---

## 17. Functional Requirements Traceability

Use this table to verify every feature maps to a requirement:

| FR# | Requirement | Implemented by | Test |
|---|---|---|---|
| FR-01 | Multi-Tenant Isolation | `tenantResolver.ts` · Schema-per-Tenant · Prisma search_path | Tenant Isolation Integration Test |
| FR-02 | Automated Voter Eligibility | `eligibility.service.ts` · SIS API integration | Eligibility Engine Integration Test |
| FR-03 | Roaming Biometric Identity | `webauthn.service.ts` · SimpleWebAuthn · Credential table | Roaming Identity Playwright E2E Test |
| FR-04 | JWT Session Management | `jwt.service.ts` · `authGuard.ts` | JWT unit tests |
| FR-05 | Cryptographic Ballot Hashing | `ballot.service.ts` · Node crypto SHA-256 | Ballot Integrity unit + integration tests |

---

*End of UniVote Build Guide. This document is the build contract — every architectural decision made during development should be traceable back to a section here.*
