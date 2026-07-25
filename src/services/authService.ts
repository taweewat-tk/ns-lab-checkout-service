import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { User } from '../types';

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
