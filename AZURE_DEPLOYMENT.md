# Azure deployment

UniVote is designed to run as one Azure App Service so the browser and API
share the tenant hostname. This matters because `tenantResolver` uses the
request `Host` header to select the PostgreSQL schema. Do not deploy the web
app and API under unrelated hostnames unless you also put them behind a
reverse proxy that preserves the tenant host.

## Azure resources

Create these resources in the same region:

- Azure App Service, Node 20 LTS, Linux
- Azure Database for PostgreSQL Flexible Server, PostgreSQL 16
- Azure Key Vault (recommended for production secrets)
- A custom domain for each institution, or a wildcard domain such as
  `*.univote.example.com`

Docker is optional. The App Service can run the compiled Node application
using the startup command:

```text
node apps/api/dist/server.js
```

## App Service settings

Configure these application settings. Store secret values in Key Vault
references where possible.

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@SERVER.postgres.database.azure.com:5432/univote?sslmode=require
JWT_SECRET=<long-random-secret>
AES_KEY=<64-hex-character-key>
UNIVOTE_BIOMETRIC_SALT=<long-random-secret>
RP_ID=univote.example.com
ORIGIN=https://univote.example.com
SUPERADMIN_EMAIL=<operator-email>
SUPERADMIN_PASSWORD=<strong-password>
```

`RP_ID` must be the registrable domain used by the browser for WebAuthn. If
institutions use subdomains of one parent domain, use the parent domain. The
`ORIGIN` value must exactly match the browser origin used to vote.

## Database bootstrap

From a machine that can reach the PostgreSQL server, install the public tenant
registry and provisioning procedure once:

```bash
psql "$DATABASE_URL" -f apps/api/sql/provision_tenant.sql
```

Then deploy the application and sign in as the Super Admin to provision each
institution. The provisioning procedure creates the isolated tenant schema and
its tables. Never point tenant Prisma clients at the `public` schema.

For Azure PostgreSQL firewall rules, allow only the deployment/admin IPs and
the App Service outbound IPs. Prefer private networking for production.

## Build and deploy manually

From the repository root:

```bash
npm ci
npm run prisma:generate
npm run build
```

Deploy the repository with `apps/api/dist`, `apps/web/dist`, and production
`node_modules` included. The API serves `apps/web/dist` automatically when
`NODE_ENV=production`.

The health endpoints are:

- `/health` — process/liveness check
- `/ready` — PostgreSQL readiness check; returns HTTP 503 if the database is
  unavailable

## GitHub Actions

The workflow in `.github/workflows/azure-deploy.yml` deploys the compiled app
when `main` is updated. Add these repository settings before enabling it:

- Variable `AZURE_WEBAPP_NAME`: the App Service name
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: the App Service publish profile XML

The workflow does not contain application secrets; configure those directly in
App Service or through Key Vault.

## Local Docker

Docker Compose remains useful for local PostgreSQL and repeatable development,
but it is not required for Azure. Before using it, ensure PostgreSQL has been
initialized with `apps/api/sql/provision_tenant.sql`.
