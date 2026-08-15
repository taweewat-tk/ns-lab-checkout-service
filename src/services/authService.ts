/**
 * @generated-docs
 * JSDoc comments in this file were generated automatically; no logic was changed.
 */
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

/**
 * Hashes a plaintext password with a freshly generated random salt using scrypt.
 *
 * @param password - The plaintext password to hash.
 * @returns The hex-encoded salt and the resulting hex-encoded hash.
 */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}

/**
 * Verifies a plaintext password against a user's stored salt and hash using a
 * timing-safe comparison.
 *
 * @param password - The plaintext password to verify.
 * @param user - The user record containing `passwordSalt` and `passwordHash`.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function verifyPassword(password: string, user: User): Promise<boolean> {
  const derived = await scryptAsync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

/**
 * Builds a new `User` record by hashing the given password.
 *
 * @param username - The username for the new user.
 * @param password - The plaintext password to hash and store.
 * @returns A `User` object containing the username, password salt, and password hash.
 */
export async function createUser(username: string, password: string): Promise<User> {
  const { salt, hash } = await hashPassword(password);
  return { username, passwordSalt: salt, passwordHash: hash };
}

// Never fall back to a literal: a secret in source is a secret an attacker has.
// Without JWT_SECRET the process signs with a random key nobody can predict —
// tokens simply don't survive a restart.
const JWT_SECRET: string = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  // Production still fails closed: with more than one instance an ephemeral
  // key would make tokens fail across instances at random.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn(
    '[auth] JWT_SECRET is not set — signing with an ephemeral random secret; tokens will not survive a restart',
  );
}

// Pin the algorithm on both sides so a verifier can never be talked into
// accepting something weaker than what we sign with.
const JWT_ALGORITHM = 'HS256' as const;

const TOKEN_TTL_SECONDS = 60 * 60;

// Salt for the decoy hash below. Value is irrelevant — only the work matters.
const ABSENT_USER_SALT = randomBytes(16).toString('hex');

export interface LoginResult {
  token: string;
  expiresAt: string;
}

/**
 * Authenticates a user by username and password, issuing a signed JWT on success.
 *
 * @param username - The username to look up.
 * @param password - The plaintext password to verify.
 * @param clock - Injectable clock used to compute issue/expiry times (defaults to `systemClock`).
 * @returns The signed token and its ISO 8601 expiry timestamp.
 * @throws {Error} If the user does not exist or the password is invalid ('invalid credentials').
 */
export async function login(
  username: string,
  password: string,
  clock: Clock = systemClock,
): Promise<LoginResult> {
  const user = await userRepo.get(username);
  if (!user) {
    // Burn the same scrypt cost as the found-user path; returning early here
    // would leak which usernames exist through response timing.
    await scryptAsync(password, ABSENT_USER_SALT, 64);
    throw new Error('invalid credentials');
  }

  const ok = await verifyPassword(password, user);
  if (!ok) throw new Error('invalid credentials');

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  const expSeconds = nowSeconds + TOKEN_TTL_SECONDS;
  const token = jwt.sign({ sub: user.username, exp: expSeconds }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
  });
  return { token, expiresAt: new Date(expSeconds * 1000).toISOString() };
}

/**
 * Verifies a JWT and extracts the subject (username) from its payload.
 *
 * @param token - The JWT to verify.
 * @param clock - Injectable clock used to evaluate expiry (defaults to `systemClock`).
 * @returns The `sub` claim (username) from the verified token payload.
 * @throws {Error} If the token is invalid, expired, or missing a string `sub` claim
 * ('invalid or expired token').
 */
export function verifyToken(token: string, clock: Clock = systemClock): string {
  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      clockTimestamp: nowSeconds,
    });
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
