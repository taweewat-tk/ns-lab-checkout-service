import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';

const HOUR_FROM_NOW = () => Math.floor(Date.now() / 1000) + 3600;

describe('JWT signing key', () => {
  it('rejects a token forged with the old hardcoded dev-only-secret', async () => {
    const app = await createApp();
    const forged = jwt.sign({ sub: 'alice', exp: HOUR_FROM_NOW() }, 'dev-only-secret');

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it('rejects a token forged for a user that does not exist', async () => {
    const app = await createApp();
    const forged = jwt.sign({ sub: 'attacker', exp: HOUR_FROM_NOW() }, 'dev-only-secret');

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/login rate limiting', () => {
  const wrongPassword = (app: Awaited<ReturnType<typeof createApp>>, username: string) =>
    request(app).post('/auth/login').send({ username, password: 'wrong-password' });

  it('returns 429 once the per-minute limit is exceeded', async () => {
    const app = await createApp();
    const username = 'ratelimit-a';

    for (let i = 0; i < 5; i++) {
      const res = await wrongPassword(app, username);
      expect(res.status).toBe(401);
    }

    const blocked = await wrongPassword(app, username);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'too many requests' });
    expect(blocked.headers['retry-after']).toEqual(expect.any(String));
  });

  it('tracks each username separately', async () => {
    const app = await createApp();

    for (let i = 0; i < 5; i++) {
      await wrongPassword(app, 'ratelimit-b');
    }

    const other = await wrongPassword(app, 'ratelimit-c');
    expect(other.status).toBe(401);
  });

  it('clears the counter after a successful login', async () => {
    const app = await createApp();

    for (let i = 0; i < 4; i++) {
      expect((await wrongPassword(app, 'alice')).status).toBe(401);
    }

    const ok = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    expect(ok.status).toBe(200);

    for (let i = 0; i < 4; i++) {
      expect((await wrongPassword(app, 'alice')).status).toBe(401);
    }
  });
});

describe('JWT algorithm pinning', () => {
  const SECRET = 'authSecurity-test-secret-0123456789abcdef';
  let authService: typeof import('../services/authService');

  beforeAll(() => {
    // authService reads JWT_SECRET at module load, so it must be set before the
    // module is (re-)required to sign with a secret this test also knows.
    process.env.JWT_SECRET = SECRET;
    jest.resetModules();
    authService = require('../services/authService');
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  it('accepts an HS256 token signed with the configured secret', () => {
    const token = jwt.sign({ sub: 'alice', exp: HOUR_FROM_NOW() }, SECRET, {
      algorithm: 'HS256',
    });

    expect(authService.verifyToken(token)).toBe('alice');
  });

  it('rejects an HS512 token even though the secret is correct', () => {
    const token = jwt.sign({ sub: 'alice', exp: HOUR_FROM_NOW() }, SECRET, {
      algorithm: 'HS512',
    });

    expect(() => authService.verifyToken(token)).toThrow(/invalid or expired token/);
  });
});
