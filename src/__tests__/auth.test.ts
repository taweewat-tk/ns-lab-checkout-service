import { createUser, verifyPassword, login, verifyToken } from '../services/authService';
import { userRepo } from '../repositories/userRepo';
import { fixedClock } from '../lib/clock';

beforeEach(async () => {
  await userRepo.seed([await createUser('alice', 'secret123')]);
});

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const user = await createUser('alice', 'secret123');
    await expect(verifyPassword('secret123', user)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', user)).resolves.toBe(false);
  });
});

describe('login', () => {
  it('returns a token for correct credentials', async () => {
    const result = await login('alice', 'secret123');
    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it('rejects wrong password', async () => {
    await expect(login('alice', 'wrong-password')).rejects.toThrow(/invalid credentials/);
  });

  it('rejects unknown username', async () => {
    await expect(login('nobody', 'secret123')).rejects.toThrow(/invalid credentials/);
  });
});

describe('verifyToken', () => {
  it('returns the username for a valid, unexpired token', async () => {
    const clock = fixedClock('2026-01-01T00:00:00.000Z');
    const { token } = await login('alice', 'secret123', clock);
    expect(verifyToken(token, clock)).toBe('alice');
  });

  it('rejects a token past its 1-hour expiry', async () => {
    const issuedAt = fixedClock('2026-01-01T00:00:00.000Z');
    const { token } = await login('alice', 'secret123', issuedAt);
    const later = fixedClock('2026-01-01T01:00:01.000Z'); // 1h + 1s later
    expect(() => verifyToken(token, later)).toThrow(/invalid or expired token/);
  });

  it('rejects a token with a tampered signature', async () => {
    const { token } = await login('alice', 'secret123');
    const parts = token.split('.');
    parts[2] = parts[2][0] === 'x' ? 'y' + parts[2].slice(1) : 'x' + parts[2].slice(1);
    expect(() => verifyToken(parts.join('.'))).toThrow(/invalid or expired token/);
  });
});
