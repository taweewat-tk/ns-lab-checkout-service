import request from 'supertest';
import { createApp } from '../app';

describe('POST /auth/login (HTTP)', () => {
  it('returns 200 and a token for correct credentials', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('returns 401 for wrong password', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid credentials' });
  });

  it('returns 400 when password is missing from the body', async () => {
    const app = await createApp();
    const res = await request(app).post('/auth/login').send({ username: 'alice' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me (HTTP)', () => {
  it('returns 200 and the username for a valid Bearer token', async () => {
    const app = await createApp();
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'alice' });
  });

  it('returns 401 with no Authorization header', async () => {
    const app = await createApp();
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed Authorization header', async () => {
    const app = await createApp();
    const res = await request(app).get('/auth/me').set('Authorization', 'not-bearer-format');
    expect(res.status).toBe(401);
  });
});

describe('existing routes remain unauthenticated', () => {
  it('GET /products still works without a token', async () => {
    const app = await createApp();
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
  });
});
