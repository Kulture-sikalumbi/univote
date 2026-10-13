// src/modules/auth/auth.service.ts
//
// Credential (StudentID + password) auth for the Student and School Admin
// portals. This is "factor one" of the two-factor flow described in
// Section 9: CREDENTIAL_LOGIN happens before ELIGIBILITY_CHECK and the
// biometric handshake. A session JWT issued here only proves "this person
// knows the account's password" — it does not authorize voting; only a
// BALLOT token (issued after the WebAuthn handshake) does that.
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { hashPassword, verifyPassword } from '../../crypto/password';
import { issueSessionToken, Role } from './jwt.service';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export interface LoginResult {
  token: string;
  voterID: string;
}

/** Student credential login -> session token (role STUDENT). */
export async function loginVoter(
  tenantSchema: string,
  tenantID: string,
  studentID: string,
  password: string
): Promise<LoginResult> {
  if (!studentID || !password) {
    throw new AuthError('studentID and password are required', 400);
  }

  const db = await getPrismaForTenant(tenantSchema);
  const voter = await db.voter.findUnique({
    where: { StudentID_TenantID: { StudentID: studentID, TenantID: tenantID } },
  });

  // Constant-shape error regardless of which check failed, to avoid leaking
  // whether a given Student ID has an account.
  if (!voter || !(await verifyPassword(password, voter.PasswordHash))) {
    throw new AuthError('Invalid Student ID or password');
  }

  const token = issueSessionToken({
    voterID: voter.VoterID,
    tenantID,
    tenantSchema,
    role: 'STUDENT',
    mustChangePassword: voter.MustChangePassword,
  });

  return { token, voterID: voter.VoterID };
}

/** Set a voter's permanent password after a first login with a temporary one. */
export async function changeVoterPassword(
  tenantSchema: string,
  tenantID: string,
  voterID: string,
  newPassword: string
): Promise<{ token: string }> {
  if (!newPassword || newPassword.length < 8) {
    throw new AuthError('A password of at least 8 characters is required', 400);
  }

  const db = await getPrismaForTenant(tenantSchema);
  const voter = await db.voter.findFirst({ where: { VoterID: voterID, TenantID: tenantID } });
  if (!voter) {
    throw new AuthError('Voter account not found', 404);
  }

  await db.voter.update({
    where: { VoterID: voterID },
    data: { PasswordHash: await hashPassword(newPassword), MustChangePassword: false },
  });

  return {
    token: issueSessionToken({ voterID, tenantID, tenantSchema, role: 'STUDENT', mustChangePassword: false }),
  };
}

export interface AdminLoginResult {
  token: string;
  adminID: string;
}

/** School Admin credential login -> session token (role SCHOOL_ADMIN). */
export async function loginSchoolAdmin(
  tenantSchema: string,
  tenantID: string,
  username: string,
  password: string
): Promise<AdminLoginResult> {
  if (!username || !password) {
    throw new AuthError('username and password are required', 400);
  }

  const db = await getPrismaForTenant(tenantSchema);
  const admin = await db.schoolAdmin.findUnique({
    where: { Username_TenantID: { Username: username, TenantID: tenantID } },
  });

  if (!admin || !(await verifyPassword(password, admin.PasswordHash))) {
    throw new AuthError('Invalid username or password');
  }

  const token = issueSessionToken({
    voterID: admin.AdminID,
    tenantID,
    tenantSchema,
    role: 'SCHOOL_ADMIN' as Role,
  });

  return { token, adminID: admin.AdminID };
}
