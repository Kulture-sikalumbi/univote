// src/lib/tenantPrisma.ts
//
// Factory that returns a PrismaClient scoped to a single tenant's Postgres
// schema. Schema-per-tenant isolation (FR-01 / Section 4.1's absolute rule:
// "No query should ever cross schema boundaries") is enforced here by
// pinning each client's connection to `?schema=<tenantSchema>`, which
// Postgres/Prisma resolves to `SET search_path TO <tenantSchema>` for every
// connection in that client's pool. Tenant table models carry no @@schema
// attribute (see prisma/tenant/schema.prisma), so the same generated client
// class can serve any tenant schema depending on which URL it was built with.
//
// Clients are cached per schema name to avoid exhausting the DB connection
// limit by creating a fresh pool on every request. A simple LRU-style cap
// evicts the least-recently-used client once the cache grows too large.
import { PrismaClient } from '.prisma/tenant-client';

const MAX_CACHED_CLIENTS = 25;
const cache = new Map<string, PrismaClient>();

function buildTenantUrl(schemaName: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');

  const url = new URL(base);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

export async function getPrismaForTenant(schemaName: string): Promise<PrismaClient> {
  if (!schemaName || !/^[a-z_][a-z0-9_]{0,62}$/i.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  const cached = cache.get(schemaName);
  if (cached) {
    // Refresh recency by re-inserting.
    cache.delete(schemaName);
    cache.set(schemaName, cached);
    return cached;
  }

  const client = new PrismaClient({
    datasources: { db: { url: buildTenantUrl(schemaName) } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  cache.set(schemaName, client);

  if (cache.size > MAX_CACHED_CLIENTS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      await oldest?.$disconnect();
    }
  }

  return client;
}

export async function disconnectAllTenantClients(): Promise<void> {
  await Promise.all([...cache.values()].map((c) => c.$disconnect()));
  cache.clear();
}
