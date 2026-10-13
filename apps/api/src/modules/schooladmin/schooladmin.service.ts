// src/modules/schooladmin/schooladmin.service.ts
//
// Simple, direct voter roll management for the School Admin portal: the
// admin adds each voter (Student ID + a starting password they share with
// the student) and can flip a voter's active/inactive switch. No SIS sync
// step is required — see eligibility.service.ts for how this plugs in.
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { hashPassword } from '../../crypto/password';
import { resolveSisConnection } from '../eligibility/sisConnection';

export class SchoolAdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SchoolAdminError';
    this.status = status;
  }
}

export interface VoterSummary {
  VoterID: string;
  StudentID: string;
  IsActive: boolean;
  EnrolledAt: Date;
}

export async function listVoters(tenantSchema: string): Promise<VoterSummary[]> {
  const db = await getPrismaForTenant(tenantSchema);
  const voters = await db.voter.findMany({ orderBy: { EnrolledAt: 'desc' } });
  return voters.map((v) => ({
    VoterID: v.VoterID,
    StudentID: v.StudentID,
    IsActive: v.IsActive,
    EnrolledAt: v.EnrolledAt,
  }));
}

export async function addVoter(
  tenantSchema: string,
  tenantID: string,
  studentID: string,
  password: string
): Promise<VoterSummary> {
  if (!studentID || !password || password.length < 8) {
    throw new SchoolAdminError('studentID and a password of at least 8 characters are required');
  }

  const db = await getPrismaForTenant(tenantSchema);
  const existing = await db.voter.findUnique({
    where: { StudentID_TenantID: { StudentID: studentID, TenantID: tenantID } },
  });
  if (existing) {
    throw new SchoolAdminError('A voter with this Student ID already exists', 409);
  }

  const voter = await db.voter.create({
    data: {
      TenantID: tenantID,
      StudentID: studentID,
      PasswordHash: await hashPassword(password),
      IsActive: true, // admin-added voters are active immediately
      MustChangePassword: true,
    },
  });

  return { VoterID: voter.VoterID, StudentID: voter.StudentID, IsActive: voter.IsActive, EnrolledAt: voter.EnrolledAt };
}

export interface SisIntegrationSettings {
  sisBaseURL: string | null;
  configured: boolean;
  usingDevelopmentFallback: boolean;
}

export async function getSisIntegrationSettings(tenantID: string): Promise<SisIntegrationSettings> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { TenantID: tenantID } });
  const connection = resolveSisConnection(tenant);

  return {
    sisBaseURL: tenant.SisBaseURL,
    configured: Boolean(connection),
    usingDevelopmentFallback: connection?.source === 'development-fallback',
  };
}

export async function saveSisIntegrationSettings(
  tenantID: string,
  input: { sisBaseURL?: string; sisApiKey?: string; clear?: boolean }
): Promise<SisIntegrationSettings> {
  if (input.clear) {
    await prisma.tenant.update({
      where: { TenantID: tenantID },
      data: { SisBaseURL: null, SisApiKey: null },
    });
    return getSisIntegrationSettings(tenantID);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { TenantID: tenantID } });
  const sisBaseURL = input.sisBaseURL?.trim().replace(/\/+$/, '') || tenant.SisBaseURL;
  const sisApiKey = input.sisApiKey?.trim() || tenant.SisApiKey;

  if (!sisBaseURL || !sisApiKey) {
    throw new SchoolAdminError('Provide both the SIS base URL and API key');
  }
  try {
    const parsed = new URL(sisBaseURL);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw new SchoolAdminError('SIS base URL must be a valid HTTP or HTTPS URL');
  }

  await prisma.tenant.update({
    where: { TenantID: tenantID },
    data: { SisBaseURL: sisBaseURL, SisApiKey: sisApiKey },
  });
  return getSisIntegrationSettings(tenantID);
}

interface SisRosterStudent {
  studentID: string;
  enrollmentStatus: string;
  financialHold: boolean;
}

interface TemporaryVoterCredential {
  studentID: string;
  isActive: boolean;
  temporaryPassword?: string;
}

export interface SisSyncResult {
  created: number;
  updated: number;
  students: TemporaryVoterCredential[];
}

/** Import the configured SIS /roster response. Temporary passwords are returned once. */
export async function syncVoterRoll(tenantSchema: string, tenantID: string): Promise<SisSyncResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { TenantID: tenantID } });
  const connection = resolveSisConnection(tenant);

  if (!connection) {
    throw new SchoolAdminError('Configure this institution’s SIS endpoint and API key before importing voters', 400);
  }

  let response: Response;
  try {
    response = await fetch(`${connection.baseURL.replace(/\/+$/, '')}/roster`, {
      headers: { Authorization: `Bearer ${connection.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SchoolAdminError('Could not reach the SIS roster endpoint', 502);
  }
  if (!response.ok) {
    throw new SchoolAdminError(`SIS roster request failed with status ${response.status}`, 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SchoolAdminError('SIS roster endpoint did not return valid JSON', 502);
  }

  const rawStudents =
    payload && typeof payload === 'object' && 'students' in payload
      ? (payload as { students: unknown }).students
      : null;
  if (!Array.isArray(rawStudents)) {
    throw new SchoolAdminError('SIS roster response must contain a students array', 502);
  }

  const students = rawStudents.map((raw, index): SisRosterStudent => {
    if (!raw || typeof raw !== 'object') {
      throw new SchoolAdminError(`SIS roster student ${index + 1} is invalid`, 502);
    }
    const value = raw as Record<string, unknown>;
    const studentID = typeof value.studentID === 'string' ? value.studentID.trim() : '';
    if (
      !studentID ||
      studentID.length > 50 ||
      typeof value.enrollmentStatus !== 'string' ||
      typeof value.financialHold !== 'boolean'
    ) {
      throw new SchoolAdminError(`SIS roster student ${index + 1} is missing required fields`, 502);
    }
    return {
      studentID,
      enrollmentStatus: value.enrollmentStatus.trim().toUpperCase(),
      financialHold: value.financialHold,
    };
  });

  if (new Set(students.map((student) => student.studentID)).size !== students.length) {
    throw new SchoolAdminError('SIS roster contains duplicate student IDs', 502);
  }

  const db = await getPrismaForTenant(tenantSchema);
  const studentIDs = students.map((student) => student.studentID);
  const existingVoters = studentIDs.length
    ? await db.voter.findMany({ where: { TenantID: tenantID, StudentID: { in: studentIDs } } })
    : [];
  const existingByStudentID = new Map(existingVoters.map((voter) => [voter.StudentID, voter]));
  const prepared = await Promise.all(
    students.map(async (student) => {
      const isActive = student.enrollmentStatus === 'ACTIVE' && !student.financialHold;
      const existing = existingByStudentID.get(student.studentID);
      if (existing) return { student, isActive, existing, passwordHash: null, temporaryPassword: undefined };

      const temporaryPassword = crypto.randomBytes(18).toString('base64url');
      return {
        student,
        isActive,
        existing: null,
        passwordHash: await hashPassword(temporaryPassword),
        temporaryPassword,
      };
    })
  );

  await db.$transaction(async (tx) => {
    for (const item of prepared) {
      if (item.existing) {
        await tx.voter.update({ where: { VoterID: item.existing.VoterID }, data: { IsActive: item.isActive } });
      } else {
        await tx.voter.create({
          data: {
            TenantID: tenantID,
            StudentID: item.student.studentID,
            PasswordHash: item.passwordHash!,
            IsActive: item.isActive,
            MustChangePassword: true,
          },
        });
      }
    }
  });

  return {
    created: prepared.filter((item) => !item.existing).length,
    updated: prepared.filter((item) => item.existing).length,
    students: prepared.map((item) => ({
      studentID: item.student.studentID,
      isActive: item.isActive,
      ...(item.temporaryPassword ? { temporaryPassword: item.temporaryPassword } : {}),
    })),
  };
}

export async function setVoterActive(tenantSchema: string, voterID: string, isActive: boolean): Promise<VoterSummary> {
  const db = await getPrismaForTenant(tenantSchema);
  const voter = await db.voter.update({ where: { VoterID: voterID }, data: { IsActive: isActive } });
  return { VoterID: voter.VoterID, StudentID: voter.StudentID, IsActive: voter.IsActive, EnrolledAt: voter.EnrolledAt };
}
