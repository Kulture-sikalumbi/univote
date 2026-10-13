// src/crypto/password.ts
import bcrypt from 'bcrypt';

const COST_FACTOR = 12; // Do not lower this (Section 16 security constraints).

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST_FACTOR);
export const verifyPassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);
