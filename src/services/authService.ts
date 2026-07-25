import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { User } from '../types';
import jwt from 'jsonwebtoken';
import { Clock, systemClock } from '../lib/clock';
import { userRepo } from '../repositories/userRepo';

const scryptAsync = promisify(scrypt) as unknown as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password: string, user: User): Promise<boolean> {
  const derived = await scryptAsync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

export async function createUser(username: string, password: string): Promise<User> {
  const { salt, hash } = await hashPassword(password);
  return { username, passwordSalt: salt, passwordHash: hash };
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const TOKEN_TTL_SECONDS = 60 * 60;

export interface LoginResult {
  token: string;
  expiresAt: string;
}

export async function login(
  username: string,
  password: string,
  clock: Clock = systemClock,
): Promise<LoginResult> {
  const user = await userRepo.get(username);
  if (!user) throw new Error('invalid credentials');

  const ok = await verifyPassword(password, user);
  if (!ok) throw new Error('invalid credentials');

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  const expSeconds = nowSeconds + TOKEN_TTL_SECONDS;
  const token = jwt.sign({ sub: user.username, exp: expSeconds }, JWT_SECRET);
  return { token, expiresAt: new Date(expSeconds * 1000).toISOString() };
}

export function verifyToken(token: string, clock: Clock = systemClock): string {
  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET, { clockTimestamp: nowSeconds });
  } catch {
    throw new Error('invalid or expired token');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { sub?: unknown }).sub !== 'string'
  ) {
    throw new Error('invalid or expired token');
  }
  return (payload as { sub: string }).sub;
}
