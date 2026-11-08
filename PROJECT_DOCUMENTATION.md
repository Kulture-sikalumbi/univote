# UniVote Project Documentation

## A secure digital student election platform for higher-learning institutions

**Project type:** Software Engineering Final Year Project  
**System name:** UniVote  
**Version:** 0.1.0  
**Date:** October 2026

---

## 1. Abstract

UniVote is a web-based electronic voting platform designed for higher-learning
institutions. It enables institutions to create and manage student elections,
register eligible voters, publish candidates, and receive votes electronically.
Students authenticate with their institutional credentials and a WebAuthn
platform authenticator such as a fingerprint, face unlock, or passkey before
they receive permission to vote.

The system is multi-tenant: each institution has its own isolated PostgreSQL
schema, voter roll, administrators, elections, candidates, and ballots. A
shared public schema stores only the institution registry. The design also
separates the record that proves a student has voted from the ballot record
itself. This allows the platform to enforce one vote per student without
storing a voter identity on a ballot.

The project is implemented as a TypeScript monorepo with a React progressive
web application and an Express API. Prisma is used for database access,
PostgreSQL is the production database, and the system can be deployed on
Azure App Service.

## 2. Background and problem statement

Many student elections are conducted using paper ballots, informal online
forms, or systems that are not designed for institutional voter management.
These approaches can cause:

- slow election preparation and vote counting;
- difficulty confirming that a voter is an enrolled student;
- duplicate voting or weak enforcement of one vote per student;
- limited auditability and ballot-integrity controls;
- privacy concerns when voter identity is stored together with vote choice;
- difficulty supporting multiple institutions on one platform.

UniVote addresses these problems by combining institution-managed elections,
eligibility verification, strong authentication, anonymous ballot storage,
and tenant isolation in one application.

## 3. Aim and objectives

### 3.1 Aim

To design and implement a secure, institution-managed digital voting platform
for student elections.

### 3.2 Specific objectives

1. Provide a central platform that can serve multiple institutions.
2. Isolate each institution's data from every other institution.
3. Allow school administrators to configure elections, offices, affiliations,
   candidates, and voters.
4. Verify that a student is eligible before allowing a vote.
5. Use password authentication and WebAuthn biometric/passkey verification.
6. Enforce one vote per student per election.
7. Preserve ballot anonymity by keeping voter identity out of the ballot table.
8. Protect ballot records using hashing and encrypted timestamps.
9. Provide election results to authorized school administrators.
10. Support local development and cloud deployment on Azure.

## 4. Scope

### 4.1 In scope

- Institution registration and provisioning.
- Super Admin management of institutions.
- School Admin authentication and election management.
- Student voter authentication.
- Initial password change for provisioned student accounts.
- WebAuthn credential registration and verification.
- Optional integration with an institution's Student Information System (SIS).
- Voter activation/deactivation.
- Election creation and status management.
- Election offices and affiliations.
- Candidate registration, party information, manifesto links, and images.
- Ballot casting and one-vote-per-election enforcement.
- Results viewing by authorized school administrators.
- Institution branding and candidate image storage.
- Responsive React web interface and PWA support.
- Unit, integration, and end-to-end testing.

### 4.2 Out of scope

- National or government election administration.
- Replacement of an institution's SIS.
- Recovery of a lost biometric credential by the platform.
- Storing or processing the student's raw fingerprint or face template.
- Anonymous public results dashboards.
- Native Android or iOS applications.

## 5. Users and roles

| Role | Responsibilities |
|---|---|
| **Super Admin** | Register, activate, suspend, and provision institutions; manage the shared platform registry. |
| **School Admin** | Manage voters, create elections, configure offices, add candidates, open/close elections, and view results. |
| **Student/Voter** | Sign in, complete first-time password setup, register a passkey, check eligibility, and cast one ballot. |

The frontend routes users to a role-specific portal:

- `/super-admin` for the Super Admin;
- `/school-admin` for the School Admin;
- `/vote` for the Student/Voter.

## 6. System architecture

### 6.1 High-level architecture

```text
+-------------------------+
| Student / Admin Browser  |
| React + Vite PWA        |
+------------+------------+
             |
             | HTTPS / JSON API
             v
+-------------------------+
| Express TypeScript API  |
| Auth, elections, ballots|
| tenant and role guards  |
+------------+------------+
             |
             | Prisma clients
             v
+-------------------------+
| PostgreSQL               |
| public schema: tenants  |
| tenant schemas: data    |
+-------------------------+

Optional external services:
  - Institution SIS
  - Supabase Storage
  - Azure App Service / Key Vault
```

### 6.2 Repository structure

```text
univote/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/       # authentication and business modules
│   │   │   ├── middleware/    # tenant, role, and rate-limit controls
│   │   │   ├── crypto/        # hashing, encryption, and passwords
│   │   │   └── lib/           # Prisma, uploads, challenges, tokens
│   │   ├── prisma/
│   │   │   ├── public/        # shared Tenant registry
│   │   │   └── tenant/        # repeated per-institution schema
│   │   └── tests/             # unit, integration, and E2E tests
│   └── web/
│       └── src/
│           ├── portals/       # student, school admin, super admin
│           ├── components/    # reusable interface components
│           ├── hooks/         # authentication and branding hooks
│           └── lib/           # API, WebAuthn, media, and types
├── apps/api/sql/              # tenant provisioning SQL
├── .github/workflows/         # CI and Azure deployment
└── PROJECT_DOCUMENTATION.md  # this document
```

### 6.3 Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, Tailwind CSS |
| Progressive web app | Vite PWA plugin and service worker |
| Backend | Node.js, Express 4, TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Authentication | JWT, bcrypt, WebAuthn/FIDO2 |
| Security middleware | Helmet, CORS, express-rate-limit |
| Testing | Jest, integration tests, Playwright |
| Deployment | Azure App Service |

## 7. Multi-tenant database design

UniVote uses a schema-per-tenant architecture.

### 7.1 Shared public schema

The `public` schema contains the `Tenant` registry. It stores each
institution's:

- unique tenant ID;
- school name and institution code;
- optional domain and logo;
- PostgreSQL schema name;
- status (`PENDING`, `ACTIVE`, or `SUSPENDED`);
- optional SIS connection details.

### 7.2 Institution schema

Every institution receives a separate PostgreSQL schema containing:

- `Voter` — student accounts and local activation state;
- `Credential` — WebAuthn credential metadata;
- `SchoolAdmin` — institution administrator accounts;
- `Election` — election title, dates, and status;
- `ElectionOffice` — offices that must be filled;
- `ElectionAffiliation` — optional parties or affiliations;
- `Candidate` — candidates and their election positions;
- `Ballot` — anonymous vote records;
- `ElectionParticipant` — proof that a voter participated.

The API resolves the institution before handling tenant-scoped requests. A
tenant-specific Prisma client then connects using that institution's schema.
This prevents a query for one institution from accidentally reading another
institution's data.

### 7.3 Anonymity-preserving voting model

The `Ballot` table intentionally has no `VoterID` column. The system records
participation separately in `ElectionParticipant`, which contains the
`ElectionID` and `VoterID` and has a unique constraint on that pair.

When a vote is submitted, the API writes the anonymous ballot row and the
participation row in one database transaction. If the student has already
participated, the unique constraint rejects the transaction and no partial
ballot is stored.

## 8. Functional operation

### 8.1 Institution setup

1. A Super Admin signs in.
2. The Super Admin creates or activates an institution.
3. The tenant provisioning procedure creates the institution schema and
   tables.
4. The institution receives its tenant code/domain and an initial School
   Admin account.
5. The School Admin configures branding, voters, and optional SIS details.

### 8.2 Election management flow

1. The School Admin creates an election with a title and start/end times.
2. The administrator configures at least one office and optional
   affiliations.
3. Candidates are added to the relevant offices.
4. The election remains `DRAFT` while it is being configured.
5. The administrator changes it to `ACTIVE` to open voting.
6. Results can be viewed after votes are received.
7. The election is changed to `CLOSED` when voting ends.

Supported election statuses are:

- `DRAFT` — configuration stage;
- `ACTIVE` — eligible students may vote;
- `CLOSED` — voting is not available.

### 8.3 Student voting flow

The voting sequence is deliberately enforced by the API:

1. Student enters student ID and password.
2. API returns a short-lived `SESSION` token.
3. Student completes a mandatory password change if using an initial password.
4. Student registers a passkey/biometric credential, if not already enrolled.
5. Student requests an eligibility check.
6. Student starts and completes a WebAuthn authentication ceremony.
7. API verifies the credential and checks eligibility again.
8. API issues a short-lived, election-specific `BALLOT` token.
9. Student selects exactly one candidate for each configured office.
10. API validates the selections and writes the anonymous ballot.
11. The ballot token is invalidated and a partial confirmation is returned.

The final eligibility check occurs after biometric verification as a
defence-in-depth measure; a client cannot bypass eligibility by calling the
API directly.

## 9. Security design

### 9.1 Authentication and authorization

- Student and School Admin passwords are stored using bcrypt hashes.
- Sessions use signed JWTs with role and tenant claims.
- Ballot tokens are separate from session tokens and are scoped to one
  election and one tenant.
- Role guards prevent students from accessing administration routes.
- A first-login password gate forces students to replace temporary passwords.
- Login and sensitive authentication routes are rate-limited.

### 9.2 WebAuthn

WebAuthn provides phishing-resistant, device-supported authentication:

- private key material remains in the platform authenticator;
- user verification is required;
- registration and authentication challenges are single-use and expire;
- the expected origin and relying-party ID are checked;
- authenticator signature counters are monitored where supported;
- public keys are encrypted at rest and protected by a salted integrity hash.

The application never receives or stores a raw fingerprint or face template.

### 9.3 Ballot protection

- Ballot rows do not contain a voter identity.
- Ballot hashes provide tamper-evident integrity.
- Timestamps are encrypted using AES-256.
- Ballot tokens expire after a short period and are single-use.
- Candidate selections are checked against the election and its offices.
- Database constraints enforce one participation record per student/election.

### 9.4 Application and infrastructure security

- Helmet sets HTTP security headers.
- CORS is configured at the API boundary.
- HTTPS is expected for production WebAuthn.
- Production secrets are supplied through Azure App Service settings or
  Key Vault rather than committed to source control.
- PostgreSQL firewall access should be restricted to deployment/admin and
  application networks.
- The development SIS mock router is not mounted in production.

## 10. API overview

The API is rooted at `/api/v1`.

| Area | Example operations |
|---|---|
| Authentication | Student login, School Admin login, password change, WebAuthn registration and login |
| Eligibility | Check enrollment, local activation, financial hold, election status, and prior participation |
| Ballots | Read the authorized ballot and cast selections |
| Elections | Create elections, configure options, set status, add candidates, upload images, view results |
| Voters | Register, list, activate, deactivate, and synchronize voter accounts |
| Super Admin | Manage institutions and provision tenants |
| Branding | Retrieve and update institution identity assets |

Health endpoints:

- `GET /health` — process/liveness check;
- `GET /ready` — database readiness check, returning HTTP 503 when the
  database is unavailable.

## 11. Testing and quality assurance

The project contains three testing layers.

### 11.1 Unit tests

Unit tests cover isolated rules and utilities, including:

- password hashing and verification;
- JWT claims and expiry;
- ballot hashing;
- AES timestamp encryption;
- system-salted credential hashing;
- token blocklisting;
- role/password-gate behavior;
- eligibility decisions.

### 11.2 Integration tests

Integration tests use a real database to verify:

- eligibility and SIS outcomes;
- ballot hashes and encrypted timestamps;
- anonymous ballot storage;
- duplicate-vote rejection;
- tenant schema isolation.

### 11.3 End-to-end tests

Playwright tests exercise browser-level scenarios, including:

- a student changing the initial password and registering a passkey;
- voting from a second device using a roaming identity;
- single-use ballot tokens;
- cross-tenant ballot-token rejection.

Run the available checks from the repository root:

```bash
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

Integration and end-to-end tests require the configured test database and
their corresponding environment variables.

## 12. Installation and local development

### 12.1 Prerequisites

- Node.js 20 or later;
- npm;
- PostgreSQL 16;
- a browser with WebAuthn/passkey support for full voting flows.

### 12.2 Install dependencies and generate Prisma clients

```bash
npm ci
npm run prisma:generate
```

Configure the API environment with a PostgreSQL `DATABASE_URL`, a strong
`JWT_SECRET`, a 64-hex-character `AES_KEY`, a biometric salt, and WebAuthn
`RP_ID` and `ORIGIN` values. The web application can use the default relative
API path (`/api/v1`) or `VITE_API_BASE_URL` for a split-host setup.

### 12.3 Start development servers

Run the API and web application in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

The API development server is configured by the API package and the Vite
development server hosts the React application.

## 13. Production deployment

The recommended cloud target is one Azure App Service running the API and
serving the compiled web application from the same hostname. Sharing a
hostname is important because the tenant resolver uses the request host and
because WebAuthn requires an exact origin configuration.

Required production resources:

- Azure App Service running Node 20 LTS on Linux;
- Azure Database for PostgreSQL Flexible Server;
- Azure Key Vault for secrets where possible;
- a custom institution domain or controlled wildcard domain.

Build and deploy:

```bash
npm ci
npm run prisma:generate
npm run build
```

The API serves `apps/web/dist` when `NODE_ENV=production`. The production
startup command is:

```text
node apps/api/dist/server.js
```

Deployment details, required App Service settings, health endpoints, and
GitHub Actions requirements are maintained in
[AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md).

## 14. Limitations and future improvements

The current version is a working academic project foundation. Potential
future improvements include:

1. Add an administrative audit-log interface for election actions.
2. Add configurable election opening and closing automation.
3. Add richer result visualizations and downloadable reports.
4. Add a production-grade SIS connector framework and scheduled
   synchronization.
5. Add centralized observability, alerting, and security event reporting.
6. Move all uploads to a managed object store in production.
7. Add formal external security testing and accessibility compliance testing.
8. Introduce backup/restore procedures and disaster-recovery runbooks.
9. Add multilingual interface support.
10. Add formal key rotation and credential-recovery administration workflows.

## 15. Conclusion

UniVote demonstrates how software engineering principles can be applied to a
security-sensitive institutional workflow. The project separates platform
administration from institution administration, isolates tenant data, uses
strong authentication before voting, and preserves ballot anonymity while
enforcing one vote per student. Its modular TypeScript architecture,
automated tests and an Azure deployment path provide a
foundation for further research, institutional piloting, and production
hardening.

## 16. Presentation summary

For a short supervisor presentation, explain the system in this order:

1. **Problem:** traditional student elections are slow, difficult to audit,
   and vulnerable to duplicate voting or weak eligibility checks.
2. **Solution:** UniVote is an institution-managed, multi-tenant digital
   election platform.
3. **Users:** Super Admin, School Admin, and Student/Voter.
4. **Key innovation:** WebAuthn verification plus anonymous ballots.
5. **Data design:** shared tenant registry and isolated institution schemas.
6. **Voting process:** password -> eligibility -> biometric verification ->
   scoped ballot token -> validated ballot submission.
7. **Security:** role guards, rate limiting, encrypted timestamps, salted
   credential protection, ballot hashing, and database constraints.
8. **Evidence:** unit, integration, and Playwright end-to-end tests.
9. **Deployment:** Azure App Service with PostgreSQL.
10. **Future work:** audit logs, SIS automation, monitoring, and formal
    security/accessibility assessment.
