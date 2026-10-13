// src/lib/prisma.ts
//
// Singleton client for the shared `public` schema (Tenant registry only).
import { PrismaClient } from '.prisma/public-client';

declare global {
  // eslint-disable-next-line no-var
  var __univotePublicPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__univotePublicPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__univotePublicPrisma = prisma;
}
